# Rapid Optics Studio V1 — Phase 4 Acquisition Implementation Plan

> **Status:** Decision Review — Q1～Q7、Q9 明确决策 Approved；剩余 Open 见 §9.1；4A 契约未实现，Phase 4 未完成<br>
> **Date:** 2026-11-08  
> **Depends on:** Phase 3 — Raman + Virtual CCD  
> **Roadmap:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) 第 3.2、4 节  
> **Current status:** [CURRENT_PHASE.md](CURRENT_PHASE.md)

本文只规划 Phase 4。产品需求以 [PRD.md](PRD.md) 为准；第 9.1 节区分 PRD 原有要求、本次 Approved 工程决策和仍然 Open 的细节。Approved 不等于已实现或整个计划获准执行。本次仅 Decision Review 与文档更新，不实现契约、UI、循环或 4B；未决行为不得作为默认值实现。

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

不引入后端、数据库、新 npm 依赖、monorepo、通用任务框架、硬件控制、无限累积、pause/resume。取消时保留已完成 exposures，见 Approved Q2；手动 Stop 是否提供及 error 数据留存仍 Open，不把 PRD 配置变更 Stop 自动扩展成额外功能。

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

目前没有 AcquisitionRun / average / acquisition state machine / snapshot builder。当前 preview 优先选一个 Raman context、再选其返回谱仪；正式采集按 Approved Q6 在点击时冻结当前有效配置、不新增选择器，多目标消歧仍 Open。`revision` 会随 component name 等非物理字段变动递增，不能作为所有取消行为的最终依据；Q7 已批准独立科学配置 revision 或等效机制。

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

以下是结合 Approved 决策更新的概念契约，不是已实现 TypeScript；Open 项不得隐式固化。最终字段拼写可沿用现有 snake_case 风格，但必须保留 PRD §42 每个字段的语义映射。

### 4.1 AcquisitionRequest / Runtime

| 契约 | 最小内容与约束 |
|---|---|
| Request | mode single/average，N 为正整数；single=1、average>1，Average 默认 N=20；integration 为有限正数，读取 authoritative detector，目标身份按 Q6；不能拥有另一份可独立漂移的 detector configuration |
| Runtime | status、run token/ID、requested N、completed exposure count k、frozen inputs、已接受的不可变 exposures、临时累加器、RNG 状态/来源、取消或错误原因、startedAt；completedAt 仅成功完成时写入 |
| Runtime 生命周期 | `0 ≤ k ≤ N`；running 仅能接受本 token 的下一次 exposure；终态后迟到任务不得写入；timer/RNG closure 不属于可保存 Run |

Q3 Approved：正式采集 integration 必须为有限正数，N 必须为正整数。Phase 3 detector/preview 仍可接受 0 秒，不为正式采集校验破坏既有科学原语。最大 N 根据 CCD bin 数、逐帧留存及资源测试确定，不预设未经验证的产品上限，也不宣称无限资源。数值不可安全表示或资源不足时明确拒绝，不产生半成品；具体资源策略仍 Open。校验失败不得污染记录或设计；不得静默取整、clamp 或改 N。

### 4.2 Immutable Instrument Snapshot

启动时一次捕获同一配置的以下数据，之后 exposure、expected、metrics 只消费该快照对应的输入：

| PRD 字段 | 计划内容 |
|---|---|
| opticalSceneSnapshot | 完整 OpticalScene，保留 mm、组件 IDs/参数/transform/enabled |
| simulationSettingsSnapshot | SimulationConfiguration；对应 Raman/focus/noise 等实际模型参数及版本或可确定解析的版本标识 |
| materialSnapshot | 实际材料定义：名称、peaks、width、relative intensity、fluorescence、provenance；不能只保存 registry ID 或模块对象引用 |
| spectrometerSnapshot | 实际谱仪 component ID、VirtualSpectrometerConfiguration 和完整 VirtualCcdConfiguration；显式保存 integration/gain/QE/full well/read/dark |
| 辅助 provenance | Acquire 点击时当前有效 Scene/Material/Laser/Spectrometer/Detector 配置、实际 source/sample/objective/spectrometer 身份、轴、context、acquisition configuration revision、模型版本；不新增独立目标选择器（Approved Q6） |

expected 与 snapshot 必须来自同一个 authoritative 状态；从 live derived 取缓存仅在确认其输入身份/配置匹配时允许，否则从 frozen 输入重算。现有 sceneRevision 对 name-only edit 也更新，单个 revision 相等不能替代完整来源核对。

多有效目标的消歧、dark-only 可采资格及无有效目标的校验细节仍 Open；不能将现有 preview 排序/fallback 自动认定为正式采集规则。

建立**脱离 live state 的数据副本并递归保护**：TypeScript readonly 不足以保证运行时不变，顶层 `Object.freeze` 也不保护所有嵌套对象。复用现有 Zod schema 并审计嵌套 readonly/数组，缺少保护处使用最小复制/冻结边界；通过外部引用修改测试证明。快照不是第二份可编辑设计，是科研记录的历史条件。

### 4.3 AcquisitionExposure 与 RawAcquiredSpectrum

| 数据 | 契约与语义 |
|---|---|
| AcquisitionExposure | 独立 kind，run ID、exposure index、axis、counts、detector bounds、noise model version、RNG provenance 及 clipping 证据；不得伪装为 preview |
| RawAcquiredSpectrum | 独立 raw-acquisition kind，run ID、axis、counts（单位 counts/bin）、aggregation=mean、N；为未处理的平均结果 |
| N=1 | raw counts 等于本次正式 exposure counts；仍创建 Run，不能把现存 Preview 直接晋升成 Run |
| N>1 | 同一 frozen expected/axis/detector 下恰好 N 次噪声 realization，`mean[j] = Σ exposure_i.counts[j] / N`；不是求和，也不是把 integration 乘 N 后生成一次 noise |

同长度不同 axis 的 exposure 也不得合并；验证 run/index/axis/单位/边界/有限值。单次 counts 使用现有 noise primitive 输出的 clipped detector counts，平均结果不做 baseline、平滑、归一化、扣 dark 或峰处理。Q1 Approved 工程决策：保留每次 exposure 原始 CCD counts 与成功完成 N 次后的 raw mean，两者均脱离 live/累加器引用并递归保护。原始 counts 指 clipping 后的未处理输出，不是 unclipped/noise arrays；额外留存 noise arrays 仍 Open。Phase 4 留存指内存记录，不等于文件持久化。

数值实现需避免 sum 溢出和误差扩散，可选择稳定增量均值；以可手算 fixture 和数值容差验证，不锁定内部求和写法。保留 clipping/saturation 汇总所需证据，避免仅由 mean 推断全部 exposure 状态。

### 4.4 AcquisitionRun（PRD §42 完整映射）

| PRD 要求 | Phase 4 契约要求 |
|---|---|
| id / timestamp | 稳定唯一 Run ID；Q9 Approved：startedAt、completedAt 为 UTC ISO 8601（Z）时间戳，Clock 可注入；timestamp 别名映射及 ID 格式仍 Open，不删除 PRD 时间追溯要求 |
| integrationTime / numberOfExposures | 单次 integration（秒）和完成的 N；与 snapshot detector、raw N 一致 |
| 四类 Snapshot | 4.2 所列完整历史条件 |
| expectedSpectrum | 本次 frozen deterministic **ExpectedCcdSpectrum**，不引用未来 live expected，也不用 Raman relative intensity 代替 detector counts |
| acquiredSpectrum | 4.3 未处理 raw mean；必须与该 Run expected 的 axis 对应 |
| focusEfficiency | 复用 frozen context.focus.efficiency（0～1、无量纲）及既有 focus model/version |
| ramanPower / rayleighLeakage / rayleighOD | 优先复用 Phase 3 可靠定义，保留单位、采样位置、来源及 proxy 标签；不能将 effective-excitation proxy 改称绝对 Raman 辐射功率。无可靠定义为 null + 明确 undefined reason；OD 当前未定义，不发明公式 |
| snr / saturation | SNR 当前未定义，保存 null + undefined reason；保留 expected saturation 与逐 exposure clipping 证据，复用各自边界；Run saturation 汇总仍 Open，不由 mean 独自推断 |
| simulationModelVersion | 可追溯版本标识，关联实际 optics/Raman/focus/CCD/noise/aggregation/metrics 实现；不是只写应用版本 |
| 工程 provenance（Approved Q5） | request mode、实际目标 IDs、独立可记录 seed、RNG algorithm/version、sampling algorithm/version、noise model version、消费顺序；测试可注入固定 seed，正式 seed 与 Preview 独立 |

只有达到 N 且平均、指标字段（含合法 null/reason）和完整契约均校验成功的结果进入 Completed Runs，一次性原子追加，不能先写半成品再补字段。Completed Run 保留恰好 N 个不可变 exposures 和 raw mean。已完成 Run 不因随后编辑、Undo/Redo、新采集、live preview 重算或 UI 切换而更改、覆盖或丢失。

Q2 Approved：Cancelled Run 保留 frozen snapshot、expected、provenance、requested N、completed exposure count k、已接受的 k 个不可变 exposures 与取消原因，允许 k=0。它是非完成记录，不进入 Completed Runs，不生成完整 acquiredSpectrum/raw mean，completedAt 不得伪填取消时间。k 也可能等于 N（末帧已接受、完成尚未提交），仍不得冒称完成。取消时间字段和 error 留存策略仍 Open，不自动增加手动 Stop。

Phase 5 将用 run ID 关联 processing 输入，并生成独立 processed 输出；Phase 4 不增加空 processing pipeline。Phase 7 消费普通数据契约，不序列化 runtime、timer、RNG 函数或 Trace 缓存；正式序列化与 migration 不在本阶段实现。

### 4.5 Metric Availability 与 Phase 3 定义核对

Q4 Approved：每个 PRD 指标字段必须存在。有可靠定义时保存有限值及来源/单位/模型版本；无可靠定义时保存 `null` 与非空 `undefined reason`。禁止 NaN、Infinity、任意 epsilon 或占位 0；null 不等于零信号。缺失科学定义应记录 availability，不伪装为数值或计算异常。

- `src/core/raman/couplingContracts.ts` / `opticalCoupling.ts` 已定义 focus efficiency、`raman_return.detected_effective_excitation_power_mw`、`rayleigh_return.detected_effective_leakage_power_mw`。后两者是 detected-stage 的简化有效功率/proxy（mW），不是绝对 Raman 辐射测量。保留已有证据；若 PRD power 字段不能可靠对应，使用 null/reason，最终映射仍待审核。
- `contracts.ts` / `virtualSpectrometer.ts` 的 expected saturation 为 full-well 语义；`previewExposure.ts` 的 high clipping 是 unclipped counts 严格大于 full well。分别保留，不能偷换统一阈值；Run 汇总表示仍 Open。
- 当前无可直接复用的 SNR / Rayleigh OD 定义。二者 null 的 reason 应明确为“当前模型未定义该指标”，不得发明公式。
- **PRD 验收差异：** §42 列出指标，§73 要求保存 SNR，未明确允许 null。本次批准如实保存 availability 的工程策略，不修改 PRD，不宣称已满足数值 SNR/OD 验收；Phase 4 总验收前仍需明确审核此差异。

## 5. State Machine

沿用总体计划第 3.2 节的五个外部状态；snapshot/average/metrics 可作为 running 内部步骤，不提前增加 pause/resume。

| 当前状态 | 事件 / 条件 | 结果与约束 |
|---|---|---|
| idle / completed / cancelled / error | Acquire，校验通过 | 新 token；一次捕获 snapshot 和 frozen expected；k=0；进入 running |
| 非 running | Acquire，输入无效或依赖不可用 | 显示可读原因，不创建 completed Run；具体 invalid-start UI 表示在 4A 固化 |
| running | 本 token 下一次 exposure，k+1<N | 保留本次不可变 exposure，更新 runtime 进度/累加器；不写 Completed Runs |
| running | 本 token 第 N 次 exposure，配置仍有效 | 保留 N 帧，平均、metrics availability、验证后原子追加完整 Run，写 completedAt，completed；不生成 N+1 |
| running | Instrument configuration changed | cancelled；原子失效 token、停止调度、提示原因；保留已接受帧和 snapshot，不生成完整均值、不进入 Completed Runs |
| running | 生成 / 聚合 / metrics / validation 异常 | error；停止调度，不产生伪 completed Run，保护旧记录和编辑器 |
| running | 重复 Acquire | 建议拒绝启动第二个 Run；UI 禁用 Acquire；此交互决策待 Q10 |
| 任意终态或新 token 已启动 | 旧 exposure/completion 回调 | 忽略；不得污染新 run、重复追加或覆盖状态 |
| cancelled / error / completed | 新 Acquire | 建议允许重新启动新 Run（Q10）；绝不续写旧 Run |

调度层必须在 exposure 前、回调接受处、最终完成提交处检查 token 和配置有效性。配置提交与取消应在同一个 store 更新边界完成，不能等 React effect 下一次渲染才停止。完成与修改竞争以明确的原子提交顺序处理：修改先提交则不能完成；完成先提交则保留当时有效的不可变 Run。

必须让出浏览器事件循环，使用户能在 Average N 期间实际修改元件并触发 PRD G；禁止一个阻塞 UI 的同步大循环。integration 的计数时间必须 >0；是否决定墙钟等待仍为 Q3 Open，后台 tab 行为与频率见 Q8，测试使用注入 scheduler/clock，不依赖真实等待。

### 5.1 Instrument Configuration Change Cancellation

确定必须覆盖的配置修改入口：

- add/delete/duplicate/paste 元件、移动/旋转/对齐/分布、enabled/aperture/光学参数、sample material、laser wavelength、spectrometer/detector（含 integration）。
- Undo/Redo、取消拖动 transaction 导致的场景回滚、replaceScene 等绕过单个 Inspector 的入口。
- simulation configuration、未来已获授权的 material 内容更新入口：若会改变本次实验输入，同样不能混入。当前没有独立 simulation config setter，不为本计划额外创建 UI。

只读 selection、camera pan/zoom、grid visibility、snap、clipboard copy 和 editor lock 不改变科学输入，不应仅因 UI 更新打断实验。Q7 Approved：纯 rename/非科学 metadata、科学输入等值的 replaceScene 不应仅因对象身份或通用 revision 改变而取消。科学字段完整比较清单需在 4A/4D 明确并测试。

建议在现有 commitScene / scene replacement / history restoration / detector setter 的公共提交边界统一接入 guard，并以 token 兜底；不要逐个 React 控件添加独立取消逻辑。Q7 Approved：独立 acquisition configuration revision 或等效科学输入比较机制，不偷换现有 authoritative.revision。Editor History 记账本身不取消；Undo/Redo、transaction rollback 若恢复不同科学输入，仍须取消（PRD §41/§74）。Clipboard copy 不取消，paste 若新增科学元件则取消。将“Editor History 不取消”解释为改变仪器的 Undo/Redo 也不取消会与 PRD 冲突，本计划不采用该解释。

取消后必须清楚显示 PRD §41/§74 所要求的信息，例如：

```text
Optical configuration changed.
Current acquisition was stopped.
```

恢复原参数或 Undo 回原场景也不能自动恢复旧 Run；下一次 Acquire 必须重新捕获 snapshot。

## 6. Implementation Breakdown

以下全部是**未来获授权后**的子阶段。每个子阶段独立验收、汇报、停止，不因本计划列出依赖顺序而自动继续。

### Phase 4A — Decision Review & Acquisition Contracts

**状态：** Decision Review 文档已更新；Contracts/Zod/fixtures 未实现，4A Exit Gate 未通过。

**依赖：** Phase 3 记录与代码核对；§9.1 Approved 决策及仍影响契约的 Open 项。

**工作：** 固化 Request/Exposure/Raw/Run/Snapshot/Runtime 最小契约和 Zod 校验；记录 PRD 字段映射、单位、immutability 策略、metrics 定义及 Q 决策。不实现 UI 或采集循环。

**独立验收：**

- 合法 single/average fixture 通过；拒绝模式/N 不匹配、非整数、非法数值、轴/数组不一致、缺失 snapshot/版本/必需指标字段；null 必须附非空 reason，有限值与 reason 状态一致。integration=0/负数/非有限值拒绝，保留 Phase 3 零 integration 原语回归。
- snapshot、每次 counts 和 raw mean 深层脱离输入引用；live scene、材料、detector、累加器和其他帧修改不能改变记录。
- Completed 恰好 N 帧且有 raw mean；Cancelled 的 k=0/部分/N 帧均不进入 Completed、不生成完整结果；拒绝帧索引/run ID/axis/N/k 不一致。
- RNG/sampler algorithm/version/seed 必填；注入 Clock 验证 UTC startedAt/completedAt 与状态相符，取消不伪填完成时间。
- PRD §42 所有字段均有语义落点；未决行为不以随意默认值进入契约。
- 核心契约不依赖 React/Zustand/DOM；相关测试及 test/lint/build 通过。

### Phase 4B — Exposure Reuse, Mean & Metrics

**依赖：** 4A；遵循 Q1/Q4/Q5 Approved，相关 Open 先收口。

**工作：** 复用共享 CCD realization，保留 Preview API；建立 acquisition adapter、独立 RNG 流、平均与经审核的指标纯函数。不启动 store runtime。

**独立验收：**

- 旧 Preview 固定输入/seed 输出逐值保持；Expected 不变。
- 同 snapshot+RNG provenance 可复现完整 acquisition 序列；同 run 多次 exposure 消费新 draws，不能重复同一随机帧充数。
- N=1 恒等；手算 N=2/3 均值准确；不同 axis/index/run 的 exposure 拒绝聚合。
- counts 有限且在 detector 边界内；零/近零/高 dark/read noise/饱和输入安全；metrics 的 null/reason 与 saturation 边界有测试，不发明 SNR/OD 公式，保留逐帧证据。
- 未加入 baseline/平滑/峰检测；相关测试及 test/lint/build 通过。

### Phase 4C — Acquisition Runtime & Atomic Completion

**依赖：** 4A、4B；Q2/Q3/Q9 已批准部分及剩余 Open、Q10 确认。

**工作：** 增加独立 runtime 和 completed records 边界、可测试 scheduler/clock/seed 接口、start/exposure/complete/error 转移及一次性完成提交。尚不提供正式 UI 入口；先验证取消事件/token 基础协议，完整编辑入口接线在 4D。

**独立验收：**

- N=1 与 N=20 恰好 N 次、自动 completed、仅追加一个完整 Run；expected、raw、N、integration、snapshot、metrics 相符。
- 重复 start 按确认策略处理；无 N+1；旧回调、重复 completion、error 后回调无效。
- 注入生成或 metrics 错误后无半成品 completed Run，既有记录不变；可按审核策略重启。
- 第0/k/N帧完成提交前取消时，保留已接受帧且不可变，无完整均值；迟到帧被拒绝，cancelled 记录不被重启覆盖。
- 注入 Clock 验证 UTC 时间，仅 completed 写 completedAt；未知指标按 null/reason 完成，与计算异常进入 error 区分。
- runtime 不混入 editor history/derived；让出事件循环；相关测试及 test/lint/build 通过。

### Phase 4D — Instrument Change Cancellation Integration

**依赖：** 4C；Q6/Q7 Approved，目标与科学输入身份的 Open 细节先收口。

**工作：** 接入所有科学输入 mutation 提交边界和配置检查，原子取消与原因事件；处理 transaction/Undo/Redo/replaceScene、最终 exposure 竞争。

**独立验收：**

- 运行中改 Mirror、sample、wavelength、detector/integration、simulation 输入等均取消；无新旧输入混合。
- add/delete/paste/duplicate、Undo/Redo、transaction rollback、replaceScene 有覆盖；最后一次 exposure 与修改交错时无非法完成。
- 迟到回调不能更新已取消状态，也不能污染下一次 run。
- selection/camera/grid/clipboard copy/lock/history 记账不误取消；name-only/科学等值替换不误取消，物理 Undo/Redo 必须取消；原因消息可由 UI 消费；相关测试及 test/lint/build 通过。

### Phase 4E — Acquisition UI & Result Inspection

**依赖：** 4D；Q2/Q3/Q6/Q8/Q10 相关交互已确定。

**工作：** Single/Average 模式、N、现有 integration 控件、Acquire、k/N、终态原因；查看 completed Run 的 raw、frozen expected 与 snapshot 摘要。最小记录选择供检查，不实现谱库管理或完整多谱分析。

**独立验收：**

- single 锁定 N=1，average 校验 N>1；invalid input 有明确错误；界面不出现另一份 detector/integration 权威状态。
- running/completed/cancelled/error 清晰，重复 Acquire 按确认策略受控；取消原因可见；旧结果不会被实时预览替换。
- 结果明确标注 Preview / Expected at acquisition / Raw acquired mean、N、integration、counts 和模型近似；旧 Run 使用自己的 axis/full well，不借当前配置重画历史语义。
- 可检查 snapshot 与指标；无 baseline、峰检测、文件导出等后续功能。
- 未定义指标明确显示 unavailable/reason，不显示占位数；Cancelled 显示已完成 k/N 与原因，不展示为完整平均结果、不计入 Completed Runs，后续采集不得覆盖已保留帧。
- 自动 rendering/store 测试通过；`npm run dev` 实际浏览器检查 Single、Average、编辑取消和错误恢复；test/lint/build 通过。

### Phase 4F — Regression & Phase Exit Review

**依赖：** 4A～4E 均已验收。

**工作：** PRD F/G 回归、深层不可变与跨 Run 隔离、旧阶段回归、实际浏览器验收；更新 CURRENT_PHASE / README 的真实状态。

**独立验收：**

- PRD §73：integration=1s、N=20 创建 snapshot，生成 20 次曝光，自动平均并保存完整 Run。
- PRD §74：采集中移动 Mirror 停止并提示；不产生混合状态的 completed Run。
- 完成 Run 后修改设计/材料/detector、Undo/Redo、再次采集和切换 UI，旧逐帧 counts、raw mean、expected、snapshot、metrics 深度相等；新 run 不覆盖旧记录。
- Phase 1～3 测试保留并通过，PS 3054 cm⁻¹ 不丢失；Phase 3 preview 不被记录成正式数据。
- test/lint/build 与浏览器记录齐备；未实施 Phase 5～8；整体 Exit Gate 逐项审阅后停止。

## 7. Testing Strategy

沿用 Vitest 和现有 rendering/store 测试方式，不安装测试库，不在 Phase 4 搭完整 Playwright 基础设施。

| 层次 | 核心用例与证据 |
|---|---|
| Contracts / snapshots | PRD 字段齐全；snapshot/逐帧 counts/raw mean 深层 alias 防护；axis/length/unit/ID/N/k 一致；integration>0、single=1、average>1、默认20；缺失指标/无 reason 的 null 拒绝；Completed/Cancelled 区分；UTC 时间与注入 Clock |
| Exposure / aggregation | seed + RNG/sampler version + 消费顺序复现全序列；逐帧留存、RNG 独立、N=1、手算均值、非法跨轴合并；expected/各帧/mean 不变；资源测试测量 bins×N 留存成本再提出最大 N |
| Noise / metrics | 固定 seed 批量 fixture 的均值方差；仅在远离 clipping、独立噪声时验证 variance 约 1/N，不要求每次随机 run 的 SNR 严格单调或恰好 √N；近零/饱和/无定义值按已审核规则 |
| State machine | fake scheduler 精确步进 N，取消保留第0/k/N帧且无完整结果、error 按待审策略、重启、stale token、duplicate start/complete、末帧竞争、资源清理 |
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
- [ ] Instrument Snapshot、每次 exposure 原始 counts 与 raw mean 深层不可变，不被覆盖、重新生成或处理；Cancelled 保留已接受帧、不生成完整结果、不进入 Completed Runs。
- [ ] AcquisitionRun 满足 PRD §42，保存 snapshot、expected/raw、N/integration、所有必需指标字段（Approved availability 策略）和可追溯版本；§4.5 PRD 数值指标验收差异已经明确审核。
- [ ] 配置变更立即停止并提示，包含非 Inspector 编辑路径；无跨状态数据、无迟到提交污染。
- [ ] Preview 不保存成正式数据，live expected 与历史 expected/raw 来源清楚；共享噪声算法且 Phase 3 回归不变。
- [ ] PRD F/G 在自动测试和实际浏览器通过，编辑器可在采集中响应修改。
- [ ] `npm run test`、`npm run lint`、`npm run build` 全部实际通过，浏览器验收有记录。
- [ ] 没有提前实现 Phase 5 processing/完整图表、Phase 6 3D、Phase 7 I/O 或 Phase 8 diagnostics/E2E。
- [ ] 状态文档按实际完成情况更新，随后停止，不自动推进下一阶段。

## 9. Risks / Open Questions

### 9.1 Decision Review — Approved Decisions / Open Questions

**日期：2026-11-08；依据：用户本次 Q1～Q7、Q9 明确设计决策。** Approved 仅覆盖明文决定，不批准原草案中该 Q 的所有建议；PRD 优先。本次不改 PRD，不开始实现，不标记 4A 或 Phase 4 Completed。

| ID / 状态 | PRD 原有要求 | 本次 Approved 工程设计决策 | Phase 3 核对 / 差异 |
|---|---|---|---|
| Q1 — Approved | §40/§73 保存 N 次 mean；§46/§66 Raw 不可变 | 保留每次 Exposure 原始 CCD counts 及完成 N 次的 Acquired Raw Spectrum，二者不可变 | 逐帧留存为本次新增工程选择；原 mean-only 建议撤回；Preview 不转为正式数据，不等于 Phase 7 持久化 |
| Q2 — Approved | §41/§74 配置变化停止且不混合 | 取消保留已完成 exposures；Run=Cancelled，不生成完整结果、不进入 Completed Runs | 新增非完成记录契约，不冒称完整 N |
| Q3 — Approved | Single=1、Average>1；§73 示例1s/20次 | integration 有限正数；N 正整数，Average 默认20；最大 N 根据 CCD 规模和资源测试确定，不设未验证产品上限 | 现有 detector 允许0；正数限制仅加在正式采集边界，保持 Phase 3 原语 |
| Q4 — Approved | §42 指标字段、§73 保存 SNR | 优先复用可靠定义；无定义用 null + 明确 undefined reason，不发明 SNR/OD 公式 | focus/有效功率 proxy/expected saturation 有来源，SNR/OD 无现成定义；PRD 数值验收差异见 §4.5 |
| Q5 — Approved | 可测试可重复；RNG 注入是 Phase 3 工程约束 | 记录 RNG algorithm/version、独立可记录 seed、sampling algorithm/version；测试注入固定 seed | 复用 Mulberry32（mulberry32-v1）和 Box-Muller cosine；正式契约需增加 sampler version，不改变旧 Preview 输出 |
| Q6 — Approved | 冻结实际仪器，保存四类 snapshot | 默认 Acquire 点击时当前有效 Scene/Material/Laser/Spectrometer/Detector 配置，不新增目标选择器 | 不自动批准 preview 的多目标排序/fallback 为正式规则 |
| Q7 — Approved | §41/§74 科学配置改变停止 | 独立 acquisition configuration revision 或等效机制；仅追踪影响结果的配置，Selection/View/Clipboard/Lock/History 本身不取消 | 通用 revision 含 rename；Undo/Redo 恢复不同科学输入仍取消，见 §5.1 |
| Q9 — Approved | §42 timestamp、唯一 id | UTC ISO 8601 分别记录 startedAt/completedAt；Clock 可注入 | 取消不伪填 completedAt；timestamp 别名映射/ID 格式仍 Open |

**冲突与差异报告：** Q1/Q2/Q3/Q5/Q6/Q9 细化 PRD 未规定的工程行为。Q7 需区分 history 记账和实际配置恢复；若豁免物理 Undo/Redo 将与 PRD 冲突，本计划不采用该解释。Q4 已批准如实记录 availability，但 PRD 未明确允许 null 通过 SNR 数值验收；此差异保留待审，不修改 PRD 掩盖。

以下继续为 **Open Questions**。仅可推进不依赖它们的工作，原建议不自动成为决策：

| ID | 未确认细节 | 最迟确认点 |
|---|---|---|
| Q1-R | 是否额外保留 noise/unclipped arrays；记录数量/内存预算及资源不足策略，不静默驱逐旧 Raw | 4A 留存契约 / 4C 前 |
| Q2-R | 手动 Stop；error 部分数据留存；取消时间字段及表示 | 4A 非完成契约 / 4C / 4E 前 |
| Q3-R | integration 是否决定真实等待；最大 N 资源测试方案/结果、安全表示与资源不足的具体规则 | 4A 校验 / 4C 调度前 |
| Q4-R | PRD power 字段与 proxy 最终映射；Run saturation 汇总；null SNR/OD 的 PRD 总验收解释 | 4A 指标契约 / 总验收前 |
| Q5-R | 正式 seed 来源、是否暴露用户 seed；单流或每帧派生、消费顺序的版本化格式、复现范围 | 4A provenance / 4B 前 |
| Q6-R | 多 Sample/Laser/Spectrometer 的确定性消歧；dark-only 是否可采；无有效目标的启动错误 | 4A request/snapshot 前 |
| Q7-R | 科学输入比较清单（simulation/material 内容、IDs/顺序等）及等值判定；不能以通用 revision 或对象身份代替 | 4A 配置身份 / 4D 前 |
| Q8 — Open | Preview 周期刷新、running 展示、后台 tab 与调度频率 | 4C / 4E 前 |
| Q9-R | PRD timestamp 别名映射、Run ID 格式、Clock 异常/倒退策略 | 4A 元数据 / 4C 前 |
| Q10 — Open | 重复 Acquire、终态重启、结果选择/历史保留；原单 active run/禁用按钮建议未批准 | 4C / 4E 前 |

### 9.2 工程风险与控制

| 风险 | 控制措施 |
|---|---|
| 误把 Preview 当 N 次 acquisition 或重复同一随机帧 | shared primitive + 不同 semantic adapters + 独立 advancing RNG + 序列测试 |
| snapshot 浅冻结、材料 registry alias、旧结果随 live 配置变化 | 复制并保护嵌套输入；历史结果依赖自己的 expected/axis/detector；mutation regression |
| 多 mutation 路径漏取消、最终帧竞争 | 公共提交边界 guard + token + 原子完成 + 明确交错测试 |
| N 大导致 UI 阻塞或内存膨胀 | 可取消分步调度、稳定均值；按 Q1 保留逐帧，按 Q3 测量 bins×N 内存与耗时后确定资源策略，先测量再考虑 Worker，不提前建 Worker 架构 |
| clipped Gaussian 模型被误称精确统计，√N 在饱和区误用 | 保留模型版本与近似标签；明确统计适用区；metrics 单独审核 |
| 必需 Run 指标缺口被隐藏在“Phase 3 已完成”摘要中 | 按 Q4 复用已有定义，缺失定义保存 null/reason 并报告验收差异，不伪造数值 |
| 领域记录过早变成完整 Project schema | 仅实现 Acquisition 所需契约；Phase 7 才确定外部文件 schemaVersion/migration |

审核后建议顺序：**决策收口 → 4A Contracts → 4B Exposure/Mean/Metrics → 4C Runtime → 4D Cancellation → 4E UI → 4F Regression**。本次仅完成 Decision Review 文档更新；4A 契约实现及 Exit Gate 未完成，不开始 4B，等待审核及下一次明确实施指令。
