# Rapid Optics Studio V1 — Phase 4 Acquisition Implementation Plan

> **Status:** Draft — 待审核，不是实施授权  
> **Date:** 2026-11-08  
> **Depends on:** Phase 3 — Raman + Virtual CCD  
> **Roadmap:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) 第 3.2、4 节  
> **Current status:** [CURRENT_PHASE.md](CURRENT_PHASE.md)

本文只规划 Phase 4。产品需求以 [PRD.md](PRD.md) 为准；下述字段名、模块拆分和调度方式是工程草案，不代表新增产品要求。凡 PRD 未明确的用户行为或科学指标定义，见第 9 节，确认前不得作为默认行为实现。

## 1. Goals

建立可追溯、有限次数、保护实验状态的虚拟采集闭环：

```text
Acquire → Validate → Snapshot Instrument State
        → Generate N distinct noisy exposures from frozen expectation
        → Arithmetic Mean → Metrics → Immutable AcquisitionRun
```

| 产品目标 | 权威来源 | Phase 4 验收落点 |
|---|---|---|
| Single N=1 / Average N>1，达到 N 自动结束 | PRD §40、§73 | 4B、4C、4F |
| 冻结实验条件，配置修改停止并提示，禁止混合状态 | PRD §41、§74 | 4A、4D、4F |
| 保存完整 Run、expected/acquired 与指标 | PRD §42、§73 | 4A、4B、4E |
| Preview 不作为正式科研记录 | PRD §38～39 | 4B、4E |
| Raw Data 不变，后续处理非破坏 | PRD §46、§66、§75 | 4A、4F；处理功能留 Phase 5 |
| 为未来 Expected / Raw / Processed 导出保留明确语义 | PRD §59 | 4A；实际文件导出留 Phase 7 |

## 2. Scope / Non-goals

### 2.1 In scope

- Single 与 Average N，Integration Time / Number of Exposures 输入及校验。
- Acquisition Exposure 生成、逐 bin 算术平均、Run 指标、正式结果的内存记录与查看。
- Immutable Instrument Snapshot、Run 原始谱不变性、完整 provenance。
- idle/running/completed/cancelled/error 状态机；配置变更取消；迟到回调保护和错误隔离。
- Acquisition UI：Acquire、进度、完成/取消/错误提示及最小历史结果查看。
- 复用 Phase 3 Expected CCD 和 noise/RNG；保持 Live Preview 的派生语义。
- 为以上内容增加契约、数值、状态、集成及回归测试，不升级科学模型。

### 2.2 Non-goals and handoffs

| 阶段 | Phase 4 交付边界 | 后续阶段负责 |
|---|---|---|
| Phase 5 Spectrum Analysis | 不可变 raw mean、对应 frozen expected、轴、单位、Run ID 和获取条件；最小结果图 | processing pipeline、baseline/smoothing/normalize、峰检测/FWHM、完整 zoom/pan/cursor、多谱 overlay、完整图表交互 |
| Phase 7 Project & I/O | 内存中的实验记录及可表示为普通数据的领域契约；严格区分 expected/raw | 正式 Project schemaVersion、迁移、Save/Open/Save As、刷新后恢复、JSON/CSV/PNG/SVG、材料 CSV 导入 |
| Phase 6 / 8 | 仅复用现有 2D 与基本信号状态 | 3D、通用 diagnostics engine、完整 E2E 和发布打磨 |

“保存 AcquisitionRun”在本阶段指加入应用内实验记录，不宣称已经完成文件持久化。领域 schema 校验属于 Phase 4 数据完整性，不提前建立完整 Project schema、migration 或 processing 数据模型。

不引入后端、数据库、新 npm 依赖、monorepo、通用任务框架、硬件控制、无限累积、pause/resume。手动 Stop 是否提供及其部分结果规则见 Q2，不把 PRD 的配置变更 Stop 自动扩展成额外用户功能。

## 3. Existing Architecture Assessment

### 3.1 已存在的实现与缺口

| 代码 / 测试 | 已有能力 | Phase 4 的使用方式与限制 |
|---|---|---|
| `src/core/acquisition/contracts.ts` | ExpectedCcdSpectrum、VirtualCcdConfiguration、Preview Exposure、Zod 校验和版本 | 复用轴、detector、expected；增量增加正式采集契约，不能把 Preview kind 当 Raw kind |
| `virtualSpectrometer.ts` | Raman→deterministic CCD，throughput 只应用一次；integration/dark/full well | 从 frozen 输入得到 expected，不在每次 exposure 重乘 integration/gain/throughput |
| `previewExposure.ts`、`rng.ts`、`modelParameters.ts` | injected RNG、Mulberry32、Box-Muller、Gaussian counting/read noise、clipping | 复用同一噪声算法与版本，正式采集使用独立随机流，详见 3.2 |
| `src/core/raman/*` | material/axis/focus/lineage/context、relative Raman 与 leakage 输入 | 快照包含材料实值及实际目标 lineage；不重做 Raman 模型 |
| `src/store/derivedSimulation.ts` | trace→contexts→primary preview，seed 由 sourceRevision 派生 | 复用确定性管线，不能反复拷贝 `derived.previewExposure` 形成 N 个 exposure |
| `src/store/studioStore.ts` | authoritative scene/config/detector/revision；editor/view/derived/history 分离 | 增加 acquisition runtime 与 immutable records 边界，不把 Run 写进 derived 或编辑 Undo 历史 |
| `src/features/spectrum/SpectrumPreview.tsx` | SVG expected/preview 图、材料/波长/detector 控件、focus/path/power/saturation | 保留预览；扩展最小采集入口与结果显示，公式不写在 React 内 |
| `tests/acquisition/*`、`tests/studio/spectrum*` | seeded noise、数值边界、派生更新和 rendering 测试 | 保留 Phase 3 语义，新增正式采集测试 |

目前没有 AcquisitionRun / average / acquisition state machine / snapshot builder。当前 preview 优先选一个 Raman context、再选其返回谱仪，缺少正式采集目标选择契约（Q6）。`revision` 会随 component name 等非物理字段变动递增，不能未经分类直接作为所有取消行为的最终依据（Q7）。

代码已有 focus 和 detected effective power/leakage 字段，但没有可直接复用的 Run SNR / Rayleigh OD 指标实现。Raman power 字段目前带有 effective-excitation proxy 语义，不应无说明声称为绝对 Raman 辐射功率（Q4）。

### 3.2 Phase 3 Preview Exposure 复用方式

建议在 4B 提取一个内部通用的“单次 CCD 噪声 realization”纯函数，让既有 Preview adapter 与新的 Acquisition Exposure adapter 共用；保留 `simulateCcdPreviewExposure` / `simulateSeededCcdPreviewExposure` 的签名、kind、版本和固定 seed 回归结果。提取仅限避免两套噪声算法所必需的部分，不替换整个 Phase 3 管线。

- Acquisition 从本次 frozen ExpectedCcdSpectrum 生成新 realization，Preview 仍来自当前设计派生结果。
- acquisition RNG 与 preview revision-seed 分离；同 run 的第 1～N 次使用推进的独立 draws，禁止每次重置成同一 seed。seed 分配策略见 Q5。
- 当前 Gaussian 模型、variance floor、计数单位、dark expectation 和 full-well clipping 保持不变；不引入 exact Poisson 或额外 dark 噪声叠加。
- 当前 primitive 对已 clipped expected 加噪声再截断；Expected saturation 是 `>= full well`，Preview high clipping 是 `> full well`。保留差异并在 Run 指标中明确来源，不能平均后判未饱和就丢掉早期饱和证据（Q4）。
- Preview 当前随设计/配置更新自动重算，同 revision 下固定 seed，并无周期性随机刷新。PRD §39 的刷新节奏及 running 期间展示策略见 Q8；不在本计划中默认为新增定时器。

### 3.3 模块和状态归属建议

- `src/core/acquisition`：领域契约、exposure、average、metrics、纯状态转移；不访问 store、DOM、timer、clock 或浏览器随机源。
- `src/store`：原子启动/终止/完成、run token、mutation cancellation、应用内记录；调度、时间和 seed 通过可注入边界提供。
- `src/features/acquisition`：必要时引入最小采集 UI；`features/spectrum` 只显示 typed 数据。
- 沿用一个 Studio store；采集记录属于实验数据，live derived 不作为已完成 Run 的数据源。无需另建第二套 Project 或独立可编辑 Instrument State。

## 4. Data Contracts

以下是待审核的概念契约，不是已实现 TypeScript；最终字段拼写可沿用现有 snake_case 风格，但必须保留 PRD §42 每个字段的语义映射。

### 4.1 AcquisitionRequest / Runtime

| 契约 | 最小内容与约束 |
|---|---|
| Request | mode single/average，N 为整数；single=1、average>1；integration 读取 authoritative detector，目标身份按 Q6；不能拥有另一份可独立漂移的 detector configuration |
| Runtime | status、run token/ID、requested N、completed exposure count k、frozen inputs、临时累加器、RNG 状态/来源、取消或错误原因 |
| Runtime 生命周期 | `0 ≤ k ≤ N`；running 仅能接受本 token 的下一次 exposure；终态后迟到任务不得写入；timer/RNG closure 不属于可保存 Run |

integration 当前 schema 接受 0 秒；正式采集是否允许 0、N 上限及默认值尚未规定（Q3）。校验失败不得污染记录或设计；不得静默取整、clamp 或改 N。

### 4.2 Immutable Instrument Snapshot

启动时一次捕获同一配置的以下数据，之后 exposure、expected、metrics 只消费该快照对应的输入：

| PRD 字段 | 计划内容 |
|---|---|
| opticalSceneSnapshot | 完整 OpticalScene，保留 mm、组件 IDs/参数/transform/enabled |
| simulationSettingsSnapshot | SimulationConfiguration；对应 Raman/focus/noise 等实际模型参数及版本或可确定解析的版本标识 |
| materialSnapshot | 实际材料定义：名称、peaks、width、relative intensity、fluorescence、provenance；不能只保存 registry ID 或模块对象引用 |
| spectrometerSnapshot | 实际谱仪 component ID、VirtualSpectrometerConfiguration 和完整 VirtualCcdConfiguration；显式保存 integration/gain/QE/full well/read/dark |
| 辅助 provenance | 实际 source/sample/objective/spectrometer 身份、轴、context、启动 revision、模型版本；目标选择规则按 Q6 |

expected 与 snapshot 必须来自同一个 authoritative 状态；从 live derived 取缓存仅在确认其输入身份/配置匹配时允许，否则从 frozen 输入重算。现有 sceneRevision 对 name-only edit 也更新，单个 revision 相等不能替代完整来源核对。

建立**脱离 live state 的数据副本并递归保护**：TypeScript readonly 不足以保证运行时不变，顶层 `Object.freeze` 也不保护所有嵌套对象。复用现有 Zod schema 并审计嵌套 readonly/数组，缺少保护处使用最小复制/冻结边界；通过外部引用修改测试证明。快照不是第二份可编辑设计，是科研记录的历史条件。

### 4.3 AcquisitionExposure 与 RawAcquiredSpectrum

| 数据 | 建议契约与语义 |
|---|---|
| AcquisitionExposure | 独立 kind，run ID、exposure index、axis、counts、detector bounds、noise model version、RNG provenance 及 clipping 证据；不得伪装为 preview |
| RawAcquiredSpectrum | 独立 raw-acquisition kind，run ID、axis、counts（单位 counts/bin）、aggregation=mean、N；为未处理的平均结果 |
| N=1 | raw counts 等于本次正式 exposure counts；仍创建 Run，不能把现存 Preview 直接晋升成 Run |
| N>1 | 同一 frozen expected/axis/detector 下恰好 N 次噪声 realization，`mean[j] = Σ exposure_i.counts[j] / N`；不是求和，也不是把 integration 乘 N 后生成一次 noise |

同长度不同 axis 的 exposure 也不得合并；验证 run/index/axis/单位/边界/有限值。单次 counts 使用现有 noise primitive 输出的 clipped detector counts，平均结果不做 baseline、平滑、归一化、扣 dark 或峰处理。原始单次 exposure 是否永久保存见 Q1，不将 `exposures[]` 擅自设成产品必需字段。

数值实现需避免 sum 溢出和误差扩散，可选择稳定增量均值；以可手算 fixture 和数值容差验证，不锁定内部求和写法。保留 clipping/saturation 汇总所需证据，避免仅由 mean 推断全部 exposure 状态。

### 4.4 AcquisitionRun（PRD §42 完整映射）

| PRD 要求 | Phase 4 契约要求 |
|---|---|
| id / timestamp | 稳定唯一 Run ID、明确时区的时间；timestamp 指开始还是完成待 Q9 |
| integrationTime / numberOfExposures | 单次 integration（秒）和完成的 N；与 snapshot detector、raw N 一致 |
| 四类 Snapshot | 4.2 所列完整历史条件 |
| expectedSpectrum | 本次 frozen deterministic **ExpectedCcdSpectrum**，不引用未来 live expected，也不用 Raman relative intensity 代替 detector counts |
| acquiredSpectrum | 4.3 未处理 raw mean；必须与该 Run expected 的 axis 对应 |
| focusEfficiency | frozen Raman context 的效率（0～1） |
| ramanPower / rayleighLeakage / rayleighOD | 必须有显式定义、单位、采样位置、有效性和来源；现有 proxy 与 OD 定义按 Q4 审核 |
| snr / saturation | 完成后保存；metric 方法、饱和汇总与无定义值表示按 Q4 审核，不能用固定占位数冒充 |
| simulationModelVersion | 可追溯版本标识，关联实际 optics/Raman/focus/CCD/noise/aggregation/metrics 实现；不是只写应用版本 |
| 工程 provenance（建议） | request mode、selected IDs、RNG 算法/seed 或 sequence 描述、相关算法版本；Q5 决定复现格式 |

建议只有达到 N 且平均、指标和完整契约均成功的结果进入 completed Run collection，一次性原子追加，不能先写半成品再补字段。取消/错误结果是否作为其他类型记录见 Q2。已完成 Run 不因随后编辑、Undo/Redo、新采集、live preview 重算或 UI 切换而更改、覆盖或丢失。

Phase 5 将用 run ID 关联 processing 输入，并生成独立 processed 输出；Phase 4 不增加空 processing pipeline。Phase 7 消费普通数据契约，不序列化 runtime、timer、RNG 函数或 Trace 缓存；正式序列化与 migration 不在本阶段实现。

## 5. State Machine

沿用总体计划第 3.2 节的五个外部状态；snapshot/average/metrics 可作为 running 内部步骤，不提前增加 pause/resume。

| 当前状态 | 事件 / 条件 | 结果与约束 |
|---|---|---|
| idle / completed / cancelled / error | Acquire，校验通过 | 新 token；一次捕获 snapshot 和 frozen expected；k=0；进入 running |
| 非 running | Acquire，输入无效或依赖不可用 | 显示可读原因，不创建 completed Run；具体 invalid-start UI 表示在 4A 固化 |
| running | 本 token 下一次 exposure，k+1<N | 只更新 runtime 进度/累加器；不写 completed history |
| running | 本 token 第 N 次 exposure，配置仍有效 | 平均、metrics、验证后原子追加一个 Run，completed；不生成 N+1 |
| running | Instrument configuration changed | cancelled；失效 token、停止调度、提示原因；部分数据按 Q2 |
| running | 生成 / 聚合 / metrics / validation 异常 | error；停止调度，不产生伪 completed Run，保护旧记录和编辑器 |
| running | 重复 Acquire | 建议拒绝启动第二个 Run；UI 禁用 Acquire；此交互决策待 Q10 |
| 任意终态或新 token 已启动 | 旧 exposure/completion 回调 | 忽略；不得污染新 run、重复追加或覆盖状态 |
| cancelled / error / completed | 新 Acquire | 建议允许重新启动新 Run（Q10）；绝不续写旧 Run |

调度层必须在 exposure 前、回调接受处、最终完成提交处检查 token 和配置有效性。配置提交与取消应在同一个 store 更新边界完成，不能等 React effect 下一次渲染才停止。完成与修改竞争以明确的原子提交顺序处理：修改先提交则不能完成；完成先提交则保留当时有效的不可变 Run。

必须让出浏览器事件循环，使用户能在 Average N 期间实际修改元件并触发 PRD G；禁止一个阻塞 UI 的同步大循环。integration 是否决定墙钟等待、后台 tab 行为与调度频率见 Q3/Q8，测试使用注入 scheduler/clock，不依赖真实等待。

### 5.1 Instrument Configuration Change Cancellation

确定必须覆盖的配置修改入口：

- add/delete/duplicate/paste 元件、移动/旋转/对齐/分布、enabled/aperture/光学参数、sample material、laser wavelength、spectrometer/detector（含 integration）。
- Undo/Redo、取消拖动 transaction 导致的场景回滚、replaceScene 等绕过单个 Inspector 的入口。
- simulation configuration、未来已获授权的 material 内容更新入口：若会改变本次实验输入，同样不能混入。当前没有独立 simulation config setter，不为本计划额外创建 UI。

只读 selection、camera pan/zoom、grid visibility、snap、clipboard copy 和 editor lock 不改变科学输入，不应仅因 UI 更新打断实验。component rename/metadata 与整场景无效替换的具体策略见 Q7。

建议在现有 commitScene / scene replacement / history restoration / detector setter 的公共提交边界统一接入 guard，并以 token 兜底；不要逐个 React 控件添加独立取消逻辑。是否引入 instrument revision，或比较已确认的科学输入子集，在 4D 依据 Q7 决定，不把现有 authoritative.revision 偷换成新语义。

取消后必须清楚显示 PRD §41/§74 所要求的信息，例如：

```text
Optical configuration changed.
Current acquisition was stopped.
```

恢复原参数或 Undo 回原场景也不能自动恢复旧 Run；下一次 Acquire 必须重新捕获 snapshot。

## 6. Implementation Breakdown

以下全部是**未来获授权后**的子阶段。每个子阶段独立验收、汇报、停止，不因本计划列出依赖顺序而自动继续。

### Phase 4A — Decision Review & Acquisition Contracts

**依赖：** Phase 3 记录与代码核对；审核第 9 节相关决策。

**工作：** 固化 Request/Exposure/Raw/Run/Snapshot/Runtime 最小契约和 Zod 校验；记录 PRD 字段映射、单位、immutability 策略、metrics 定义及 Q 决策。不实现 UI 或采集循环。

**独立验收：**

- 合法 single/average fixture 通过；拒绝模式/N 不匹配、非整数、非法数值、轴/数组不一致、缺失 snapshot/版本/必需指标。
- snapshot 深层数据脱离输入引用；修改 live scene、材料、detector 不能更改 fixture snapshot。
- PRD §42 所有字段均有语义落点；未决行为不以随意默认值进入契约。
- 核心契约不依赖 React/Zustand/DOM；相关测试及 test/lint/build 通过。

### Phase 4B — Exposure Reuse, Mean & Metrics

**依赖：** 4A；Q1/Q4/Q5 确认。

**工作：** 复用共享 CCD realization，保留 Preview API；建立 acquisition adapter、独立 RNG 流、平均与经审核的指标纯函数。不启动 store runtime。

**独立验收：**

- 旧 Preview 固定输入/seed 输出逐值保持；Expected 不变。
- 同 snapshot+RNG provenance 可复现完整 acquisition 序列；同 run 多次 exposure 消费新 draws，不能重复同一随机帧充数。
- N=1 恒等；手算 N=2/3 均值准确；不同 axis/index/run 的 exposure 拒绝聚合。
- counts 有限且在 detector 边界内；零/近零/高 dark/read noise/饱和输入安全；已审核 metrics 的零分母和 saturation 边界有测试。
- 未加入 baseline/平滑/峰检测；相关测试及 test/lint/build 通过。

### Phase 4C — Acquisition Runtime & Atomic Completion

**依赖：** 4A、4B；Q2/Q3/Q9/Q10 确认。

**工作：** 增加独立 runtime 和 completed records 边界、可测试 scheduler/clock/seed 接口、start/exposure/complete/error 转移及一次性完成提交。尚不提供正式 UI 入口；先验证取消事件/token 基础协议，完整编辑入口接线在 4D。

**独立验收：**

- N=1 与 N=20 恰好 N 次、自动 completed、仅追加一个完整 Run；expected、raw、N、integration、snapshot、metrics 相符。
- 重复 start 按确认策略处理；无 N+1；旧回调、重复 completion、error 后回调无效。
- 注入生成或 metrics 错误后无半成品 completed Run，既有记录不变；可按审核策略重启。
- runtime 不混入 editor history/derived；让出事件循环；相关测试及 test/lint/build 通过。

### Phase 4D — Instrument Change Cancellation Integration

**依赖：** 4C；Q6/Q7 确认。

**工作：** 接入所有科学输入 mutation 提交边界和配置检查，原子取消与原因事件；处理 transaction/Undo/Redo/replaceScene、最终 exposure 竞争。

**独立验收：**

- 运行中改 Mirror、sample、wavelength、detector/integration、simulation 输入等均取消；无新旧输入混合。
- add/delete/paste/duplicate、Undo/Redo、transaction rollback、replaceScene 有覆盖；最后一次 exposure 与修改交错时无非法完成。
- 迟到回调不能更新已取消状态，也不能污染下一次 run。
- selection/camera/grid/lock 等不误取消；name-only 按 Q7；原因消息可由 UI 消费；相关测试及 test/lint/build 通过。

### Phase 4E — Acquisition UI & Result Inspection

**依赖：** 4D；Q2/Q3/Q6/Q8/Q10 相关交互已确定。

**工作：** Single/Average 模式、N、现有 integration 控件、Acquire、k/N、终态原因；查看 completed Run 的 raw、frozen expected 与 snapshot 摘要。最小记录选择供检查，不实现谱库管理或完整多谱分析。

**独立验收：**

- single 锁定 N=1，average 校验 N>1；invalid input 有明确错误；界面不出现另一份 detector/integration 权威状态。
- running/completed/cancelled/error 清晰，重复 Acquire 按确认策略受控；取消原因可见；旧结果不会被实时预览替换。
- 结果明确标注 Preview / Expected at acquisition / Raw acquired mean、N、integration、counts 和模型近似；旧 Run 使用自己的 axis/full well，不借当前配置重画历史语义。
- 可检查 snapshot 与指标；无 baseline、峰检测、文件导出等后续功能。
- 自动 rendering/store 测试通过；`npm run dev` 实际浏览器检查 Single、Average、编辑取消和错误恢复；test/lint/build 通过。

### Phase 4F — Regression & Phase Exit Review

**依赖：** 4A～4E 均已验收。

**工作：** PRD F/G 回归、深层不可变与跨 Run 隔离、旧阶段回归、实际浏览器验收；更新 CURRENT_PHASE / README 的真实状态。

**独立验收：**

- PRD §73：integration=1s、N=20 创建 snapshot，生成 20 次曝光，自动平均并保存完整 Run。
- PRD §74：采集中移动 Mirror 停止并提示；不产生混合状态的 completed Run。
- 完成 Run 后修改设计/材料/detector、Undo/Redo、再次采集和切换 UI，旧 raw、expected、snapshot、metrics 深度相等；新 run 不覆盖旧记录。
- Phase 1～3 测试保留并通过，PS 3054 cm⁻¹ 不丢失；Phase 3 preview 不被记录成正式数据。
- test/lint/build 与浏览器记录齐备；未实施 Phase 5～8；整体 Exit Gate 逐项审阅后停止。

## 7. Testing Strategy

沿用 Vitest 和现有 rendering/store 测试方式，不安装测试库，不在 Phase 4 搭完整 Playwright 基础设施。

| 层次 | 核心用例与证据 |
|---|---|
| Contracts / snapshots | PRD 字段齐全；深层 alias/mutation 防护；axis/length/unit/ID 一致；非法值与必需指标缺失被拒绝 |
| Exposure / aggregation | seeded 序列复现、RNG 独立、N=1、手算均值、非法跨轴合并；expected 与输入不变 |
| Noise / metrics | 固定 seed 批量 fixture 的均值方差；仅在远离 clipping、独立噪声时验证 variance 约 1/N，不要求每次随机 run 的 SNR 严格单调或恰好 √N；近零/饱和/无定义值按已审核规则 |
| State machine | fake scheduler 精确步进 N，取消/error/重启、stale token、duplicate start/complete、末帧竞争、资源清理 |
| Store integration | 全部 5.1 mutation 入口和无关 view/editor 操作；Run collection 与 Undo/Redo history 边界；既有 records 不变 |
| Rendering / browser | 模式、N、integration、进度、通知、结果来源、旧 Run snapshot；实际编辑中取消与 UI 响应 |
| Regression | 现有 acquisition/raman/optical/studio 测试；532/633/785nm × Si/PS/Calcite、focus/断路/filter/饱和路径及动态轴 |

现有 `tests/regression/phase3PipelineRegression.test.ts` 在本次检查时未跟踪；后续实施应先核对其归属与维护状态，不静默覆盖或假定已纳入版本基线。

实现子阶段的默认验证是 `npm run test`、`npm run lint`、`npm run build`；交互子阶段另运行 `npm run dev` 做实际浏览器检查。记录实际输出、失败与未执行项；历史 Phase 3 验收不代替 Phase 4 验收。本次仅写计划，未运行这些工程验证命令。

## 8. Exit Gate

Phase 4 完成必须同时满足：

- [ ] 影响契约与用户行为的 Open Questions 已审核并写回决策，不以隐式假设实现。
- [ ] 4A～4F 各自独立验收完成。
- [ ] Single N=1、Average N>1 使用新 noisy exposures，有限 N 自动结束。
- [ ] Instrument Snapshot 完整且深层不可变；Raw mean 不被覆盖、重新生成或处理。
- [ ] AcquisitionRun 满足 PRD §42，保存 snapshot、expected/raw、N/integration、所有必需指标和可追溯版本。
- [ ] 配置变更立即停止并提示，包含非 Inspector 编辑路径；无跨状态数据、无迟到提交污染。
- [ ] Preview 不保存成正式数据，live expected 与历史 expected/raw 来源清楚；共享噪声算法且 Phase 3 回归不变。
- [ ] PRD F/G 在自动测试和实际浏览器通过，编辑器可在采集中响应修改。
- [ ] `npm run test`、`npm run lint`、`npm run build` 全部实际通过，浏览器验收有记录。
- [ ] 没有提前实现 Phase 5 processing/完整图表、Phase 6 3D、Phase 7 I/O 或 Phase 8 diagnostics/E2E。
- [ ] 状态文档按实际完成情况更新，随后停止，不自动推进下一阶段。

## 9. Risks / Open Questions

### 9.1 必须确认的行为与科学决策

以下均为 PRD 未规定的细节；列出的建议仅供审核，不作为已经批准的默认值。按影响顺序先确认 Q1～Q7，再收口 UI/时间语义。某项未决时，只可继续不依赖它的静态检查或契约讨论，不可自行选择并实现依赖行为。

| ID | 待确认事项 | 影响 / 建议审核方向 | 最迟确认点 |
|---|---|---|---|
| Q1 | Raw 保存到什么粒度：只存 mean，还是同时保存每次 exposure / noise arrays？是否有记录数量/内存限制？ | PRD 明确保存 mean、N、条件，未要求所有逐帧数组；建议最小 mean+provenance+饱和证据，但需确认数据审计需求；不静默驱逐旧 raw | 4A 契约前 |
| Q2 | 用户是否有手动 Stop？配置取消、手动停止、error 后部分 exposure 是丢弃还是保留独立 incomplete 记录？ | 必须停止是既定要求；部分数据处理未定。建议 completed collection 只收完整 N，其他记录若需要应有独立类型，不能冒称完成 N | 4A 契约前 |
| Q3 | Integration 是否控制真实等待时间？0 秒可否正式采集？N 默认/最大值、精度和资源限制？ | 当前 detector 允许 0；PRD F 不规定运行要等 20 秒。需区分模拟计数时间与墙钟调度，不沿用 Demo 140ms 为需求 | 4A 校验前；4C 调度前 |
| Q4 | SNR 的 signal/noise/window/expected 或 empirical 定义；ramanPower/leakage 的采样位置和 proxy 命名；OD 参考功率与公式；saturation 是 expected/any exposure/mean 或组合？无信号、零噪声、零泄漏如何表示？ | 必须保存这些字段，不能全推 Phase 5/8。需批准单位、算法版本及有限值/不可用值表达；避免 JSON Infinity/NaN，也不编造任意 epsilon 或 SNR=0 | 4A 指标契约前 |
| Q5 | Run seed 来源/是否可由用户指定、每帧 seed 还是单流、需复现到何种程度？ | 可注入 RNG 是已有约束。建议 run 独立 seed+versioned sequence，禁止每帧重播相同 seed；若只存初始 seed，必须记录算法和消费顺序以解释后续 exposure，不能误称每帧从同 seed 开始 | 4A provenance 前 |
| Q6 | 多 Sample / Laser / Spectrometer 时正式采集哪个目标？是否只允许单目标？无路径但有 dark/noise 时是否允许 Acquire？ | 当前 primary preview 的优先排序和 fallback 不是 PRD 的正式采集选择规则；建议显式保存选择身份；unknown material/no detector 与合法 dark-only 应区别处理 | 4A request/snapshot 前 |
| Q7 | rename/metadata 等非物理 component change 是否也取消？等值 replaceScene 是否取消？simulation 配置有效变更的判定？ | PRD 列举 component change，现有 revision 包含 name；建议区分科学输入与编辑信息，但范围需确认，不能直接无条件监听全部 revision | 4A 配置身份讨论；4D 接线前 |
| Q8 | Live Preview 是否需要定时刷新随机帧？running 时继续更新还是切换为进度/partial mean？后台 tab 是否继续？ | 当前仅随设计重算；PRD 要自动刷新但未定频率。建议最小保留实时设计预览并独立展示 Run；若决定周期刷新，要限定本阶段所需修补，不让 preview 消耗 acquisition RNG | 4C 调度、4E UI 前 |
| Q9 | timestamp 表示开始还是完成？是否额外保留 started/completed time？Run ID 格式？ | PRD 仅列 timestamp。建议显式 UTC 时间和稳定 ID，时间/ID 来源可注入，具体字段语义需确认 | 4A 元数据前 |
| Q10 | running 时重复 Acquire、终态重新采集、结果选择和历史保留的交互规则？ | 建议单个 active run、running 禁用 Acquire、终态可新建；最小结果查看不扩展成谱库管理。并行 run、删除/清空记录不自动加入 | 4C 转移、4E UI 前 |

### 9.2 工程风险与控制

| 风险 | 控制措施 |
|---|---|
| 误把 Preview 当 N 次 acquisition 或重复同一随机帧 | shared primitive + 不同 semantic adapters + 独立 advancing RNG + 序列测试 |
| snapshot 浅冻结、材料 registry alias、旧结果随 live 配置变化 | 复制并保护嵌套输入；历史结果依赖自己的 expected/axis/detector；mutation regression |
| 多 mutation 路径漏取消、最终帧竞争 | 公共提交边界 guard + token + 原子完成 + 明确交错测试 |
| N 大导致 UI 阻塞或内存膨胀 | 可取消分步调度、稳定均值；Q1/Q3 决定留存和范围，先测量再考虑 Worker，不提前建 Worker 架构 |
| clipped Gaussian 模型被误称精确统计，√N 在饱和区误用 | 保留模型版本与近似标签；明确统计适用区；metrics 单独审核 |
| 必需 Run 指标缺口被隐藏在“Phase 3 已完成”摘要中 | 按代码盘点缺失，4A/4B 明确补齐，不伪造已实现指标 |
| 领域记录过早变成完整 Project schema | 仅实现 Acquisition 所需契约；Phase 7 才确定外部文件 schemaVersion/migration |

审核后建议顺序：**决策收口 → 4A Contracts → 4B Exposure/Mean/Metrics → 4C Runtime → 4D Cancellation → 4E UI → 4F Regression**。本次到计划草案为止，等待审核及下一次明确实施指令。
