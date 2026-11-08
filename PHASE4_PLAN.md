# Rapid Optics Studio V1 — Phase 4 Acquisition Implementation Plan

> **Status:** 4A～4E 工程实现完成；4F 验证/评审已执行；Phase 4 总 PRD Exit Gate **未通过**（SNR/OD 数值定义缺失）<br>
> **Date:** 2026-11-08  
> **Depends on:** Phase 3 — Raman + Virtual CCD  
> **Roadmap:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) 第 3.2、4 节  
> **Current status:** [CURRENT_PHASE.md](CURRENT_PHASE.md)

本文记录Phase4计划及验收。PRD为产品要求；第9.1节区分已批准决策、本次授权下选定的工程细节与未解决科学问题。用户本次连续授权4B→4F，定向验证后可继续，full test/lint/build统一4F执行，不进入Phase5。SNR/OD不得编造定义，null/reason不代表数值验收通过。

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

不引入后端、数据库、新 npm 依赖、monorepo、通用任务框架、硬件控制、无限累积、pause/resume。取消保留已完成exposures，error仅runtime保留；本次最小UI不增加手动Stop，配置变更自动取消。

## 3. Existing Architecture Assessment

### 3.1 Phase 3 基线盘点（4A 前）

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

在4A之前盘点时尚无AcquisitionRun/average/runtime/snapshot；4A完成时只有契约，后续4B～4E已按本次授权实现。Preview优先选择context的逻辑保持原样，正式采集用4C独立唯一链解析；通用revision包含name，不作为取消真值，4D比较科学投影。

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

以下描述 Approved 数据语义；4A 实际 TypeScript/Zod 字段及 PRD 映射见 §4.6。Open/Deferred 项不得隐式固化，不因已有数据形状就宣称执行行为已实现。

### 4.1 AcquisitionRequest / Runtime

| 契约 | 最小内容与约束 |
|---|---|
| Request | mode single/average，N 为正整数；single=1、average>1，Average 默认 N=20；integration 为有限正数，读取 authoritative detector，目标身份按 Q6；不能拥有另一份可独立漂移的 detector configuration |
| Runtime | status、run token/ID、requested N、completed exposure count k、frozen inputs、已接受的不可变 exposures、临时累加器、RNG 状态/来源、取消或错误原因、startedAt；completedAt 仅成功完成时写入 |
| Runtime 生命周期 | `0 ≤ k ≤ N`；running 仅能接受本 token 的下一次 exposure；终态后迟到任务不得写入；timer/RNG closure 不属于可保存 Run |

Q3 Approved：正式integration有限正数、N正安全整数；Phase3原语仍可接受0。Number.MAX_SAFE_INTEGER是表示边界，不是产品容量；本次按bins、逐帧留存和资源测量采用会话数据预算（见4F），不预设固定产品N上限或宣称无限资源。失败不污染记录、不静默取整/clamp N。

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

Q6-R Approved：仅来源一致、唯一可追溯目标链，歧义拒绝，不照搬Preview排序。4A校验快照身份/material/context/波长与单一谱仪lineage；4C已实现完整候选解析及拒绝启动。Dark-only只限真实CCD可执行、必要身份明确的配置，不伪造信号。4A结构校验本身仍不冒充目标解析。

建立**脱离 live state 的数据副本并递归保护**：TypeScript readonly 不足以保证运行时不变，顶层 `Object.freeze` 也不保护所有嵌套对象。复用现有 Zod schema 并审计嵌套 readonly/数组，缺少保护处使用最小复制/冻结边界；通过外部引用修改测试证明。快照不是第二份可编辑设计，是科研记录的历史条件。

### 4.3 AcquisitionExposure 与 RawAcquiredSpectrum

| 数据 | 契约与语义 |
|---|---|
| AcquisitionExposure | 独立 kind，run ID、exposure index、axis、counts、detector bounds、noise model version、RNG provenance 及 clipping 证据；不得伪装为 preview |
| RawAcquiredSpectrum | 独立 raw-acquisition kind，run ID、axis、counts（单位 counts/bin）、aggregation=mean、N；为未处理的平均结果 |
| N=1 | raw counts 等于本次正式 exposure counts；仍创建 Run，不能把现存 Preview 直接晋升成 Run |
| N>1 | 同一 frozen expected/axis/detector 下恰好 N 次噪声 realization，`mean[j] = Σ exposure_i.counts[j] / N`；不是求和，也不是把 integration 乘 N 后生成一次 noise |

同长度不同 axis 的 exposure 也不得合并；验证 run/index/axis/单位/边界/有限值。单次 counts 使用现有 noise primitive 输出的 clipped detector counts，平均结果不做 baseline、平滑、归一化、扣 dark 或峰处理。Q1-R Approved：保留每次 exposure 原始 CCD counts 与成功完成 N 次后的 raw mean，两者均脱离 live/累加器引用并递归保护；不要求额外保存 unclipped/noise arrays。Phase 4 留存指内存记录，不等于文件持久化。

数值实现需避免 sum 溢出和误差扩散，可选择稳定增量均值；以可手算 fixture 和数值容差验证，不锁定内部求和写法。保留 clipping/saturation 汇总所需证据，避免仅由 mean 推断全部 exposure 状态。

### 4.4 AcquisitionRun（PRD §42 完整映射）

| PRD 要求 | Phase 4 契约要求 |
|---|---|
| id / timestamp | 非空不透明 Run ID；UTC ISO 8601（Z，毫秒精度）started_at/completed_at，Clock 可注入；PRD timestamp 唯一映射到 started_at，拒绝额外 timestamp 字段，无第二份可能漂移的时间数据 |
| integrationTime / numberOfExposures | 单次 integration（秒）和完成的 N；与 snapshot detector、raw N 一致 |
| 四类 Snapshot | 4.2 所列完整历史条件 |
| expectedSpectrum | 本次 frozen deterministic **ExpectedCcdSpectrum**，不引用未来 live expected，也不用 Raman relative intensity 代替 detector counts |
| acquiredSpectrum | 4.3 未处理 raw mean；必须与该 Run expected 的 axis 对应 |
| focusEfficiency | 复用 frozen context.focus.efficiency（0～1、无量纲）及既有 focus model/version |
| ramanPower / rayleighLeakage / rayleighOD | 优先复用 Phase 3 可靠定义，保留单位、采样位置、来源及 proxy 标签；不能将 effective-excitation proxy 改称绝对 Raman 辐射功率。无可靠定义为 null + 明确 undefined reason；OD 当前未定义，不发明公式 |
| snr / saturation | SNR 当前未定义，保存 null + undefined reason；saturation 显式引用 frozen expected mask/count 与逐帧 clipping 证据，不由 mean 独自推断，也不发明单一汇总布尔值 |
| simulationModelVersion | 可追溯版本标识，关联实际 optics/Raman/focus/CCD/noise/aggregation/metrics 实现；不是只写应用版本 |
| 工程 provenance（Approved Q5） | request mode、实际目标 IDs、独立可记录 seed、RNG algorithm/version、sampling algorithm/version、noise model version、消费顺序；测试可注入固定 seed，正式 seed 与 Preview 独立 |

只有达到 N 且平均、指标字段（含合法 null/reason）和完整契约均校验成功的结果进入 Completed Runs，一次性原子追加，不能先写半成品再补字段。Completed Run 保留恰好 N 个不可变 exposures 和 raw mean。已完成 Run 不因随后编辑、Undo/Redo、新采集、live preview 重算或 UI 切换而更改、覆盖或丢失。

Q2/Q2-R Approved：Cancelled保留snapshot/expected/provenance/requested N、已接受帧、原因与cancelled_at；k从exposures.length派生，允许0或N（末帧已接受、完成尚未提交）。不入Completed、无完整mean、拒绝completed_at。Error仅runtime保留输入/帧/原因，无持久化Error Run；4E没有增加手动Stop。

Phase 5 将用 run ID 关联 processing 输入，并生成独立 processed 输出；Phase 4 不增加空 processing pipeline。Phase 7 消费普通数据契约，不序列化 runtime、timer、RNG 函数或 Trace 缓存；正式序列化与 migration 不在本阶段实现。

### 4.5 Metric Availability 与 Phase 3 定义核对

Q4 Approved：每个 PRD 指标字段必须存在。有可靠定义时保存有限值及来源/单位/模型版本；无可靠定义时保存 `null` 与非空 `undefined reason`。禁止 NaN、Infinity、任意 epsilon 或占位 0；null 不等于零信号。缺失科学定义应记录 availability，不伪装为数值或计算异常。

- `src/core/raman/couplingContracts.ts` / `opticalCoupling.ts` 已定义 focus efficiency、`raman_return.detected_effective_excitation_power_mw`、`rayleigh_return.detected_effective_leakage_power_mw`。Q4-R Approved：分别映射 raman_power/rayleigh_leakage，保留 mW、源字段、context 模型版本及 detected effective power proxy 的明确语义，不宣称绝对 Raman 辐射功率；校验值与 frozen context 一致。
- `contracts.ts` / `virtualSpectrometer.ts` 的 expected saturation 为 full-well 语义（>=）；`previewExposure.ts` 的 high clipping 是 unclipped counts 严格大于 full well。分别保留，saturation.evidence 固定标明 expected-mask-and-per-exposure-clipping。
- 当前无可直接复用的 SNR / Rayleigh OD 定义。二者 null 的 reason 应明确为“当前模型未定义该指标”，不得发明公式。
- **PRD 验收差异：** §42 列出指标，§73 要求保存 SNR，未明确允许 null。本次批准如实保存 availability 的工程策略，不修改 PRD，不宣称已满足数值 SNR/OD 验收；Phase 4 总验收前仍需明确审核此差异。

### 4.6 4A 实际契约与 PRD 字段落点

实现位于 `src/core/acquisition/acquisitionContracts.ts`，由模块 index 导出；不改变 Phase 3 contracts/preview/RNG。所有 public schema 使用 strict plain-data 校验、Zod 复制和递归 freeze，输出深层 readonly；没有 timer、store 引用、随机源、曝光生成或 N>1 平均算法。

| PRD / 领域内容 | 实际字段落点 |
|---|---|
| id / timestamp / integrationTime / numberOfExposures | Run.input.id / input.started_at / input.instrument_snapshot.detector.integration_time_s / input.request.number_of_exposures；不存漂移副本 |
| 四类 Snapshot | input.instrument_snapshot.optical_scene / simulation_settings / material（含 dataset 实值及 provenance）/ spectrometer + detector |
| expectedSpectrum / acquiredSpectrum | input.expected_spectrum / Completed.acquired_spectrum；Cancelled 不允许 acquired_spectrum |
| focusEfficiency / ramanPower / rayleighLeakage / rayleighOD / snr / saturation | Completed.metrics 对应 snake_case 字段；power proxy 有单位/source/model/semantics，SNR/OD 强制 undefined/null/reason |
| simulationModelVersion | input.instrument_snapshot.simulation_model_version：optics、Raman context、Raman spectrum、focus、spectrometer、CCD、noise 版本及 contract version；不冒称 4B aggregation/metrics 算法已实现 |
| Exposure / Raw | 独立 kind、contract_version、run_id、轴、counts/bin、detector bounds；Exposure 从0连续编号、RNG provenance、clipping masks；Raw 为 arithmetic-mean、N，N=1 必须恒等 |
| Runtime | idle / running / completed / cancelled / error 的数据形状；running/error 含 token/input/exposures，error 必须有原因；终态嵌入相应 Run，无执行或转移逻辑 |

Q5-R Approved：每 Run 独立 uint32 seed（含0），单条连续流；exposure index 递增、bin index 递增、先 counting 后 read，每个正态值使用 Box-Muller cosine 两次 uniform draws，无 spare 缓存，共4 draws/bin。固定 RNG/sampler/noise/consumption-order 版本；复现限定同实现与计算环境，不承诺跨引擎逐位一致。4A 只记录并校验此契约，不消费随机数。

Q7-R Approved：`projectAcquisitionConfiguration` 仅生成深层不可变数据投影，作为配置身份依据：按现有顺序保留组件 id/type/enabled/transform/geometry/parameters，simulation settings、材料 id/peaks 科学数值/fluorescence、spectrometer/detector、target 与模型版本。排除 revision、名称、assignment 标签、dataset 描述、metadata、visualization、breadboard 显示信息及 Editor/View/History。revision 仅辅助，不能代替投影；不实现 revision 更新或取消接线。数组顺序保守保留，不未经验证做排序等价化。

Raw的N>1均值和真实随机draws已由4B实现并测试；4A契约层只校验结构、来源、边界与不变性。算法位于acquire.ts/ccdRealization.ts，不混入React。

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

本次4B～4F已获连续授权，每个子阶段完成定向验证再继续。历史4A记录保留，4B～4F实际证据如下；授权不延伸至Phase5。

### Phase 4A — Decision Review & Acquisition Contracts

**历史验收状态：** Completed（2026-11-08，893a0b6）。当时仅4A完成；本次4B～4F进度分别记录在后续小节，不改写4A历史范围。

**依赖：** Phase 3 记录与代码核对；§9.1 影响本次契约的决策已 Approved，后续事项 Deferred，不阻塞 4A。

**工作：** 固化 Request/Exposure/Raw/Run/Snapshot/Runtime 最小契约和 Zod 校验；记录 PRD 字段映射、单位、immutability 策略、metrics 定义及 Q 决策。不实现 UI 或采集循环。

**独立验收：**

- 合法 single/average fixture 通过；拒绝模式/N 不匹配、非整数、非法数值、轴/数组不一致、缺失 snapshot/版本/必需指标字段；null 必须附非空 reason，有限值与 reason 状态一致。integration=0/负数/非有限值拒绝，保留 Phase 3 零 integration 原语回归。
- snapshot、每次 counts 和 raw mean 深层脱离输入引用；live scene、材料、detector、累加器和其他帧修改不能改变记录。
- Completed 恰好 N 帧且有 raw mean；Cancelled 的 k=0/部分/N 帧均不进入 Completed、不生成完整结果；拒绝帧索引/run ID/axis/N/k 不一致。
- RNG/sampler algorithm/version/seed 必填；注入 Clock 验证 UTC startedAt/completedAt 与状态相符，取消不伪填完成时间。
- PRD §42 所有字段均有语义落点；未决行为不以随意默认值进入契约。
- 核心契约不依赖 React/Zustand/DOM；相关增量测试及 lint/build 通过。按用户最新指令，不在每次开发任务运行 full test，完整测试留大阶段验收。

**4A 验收记录：** 新增 44 个契约用例，覆盖合法 single/average、非法模式/N/integration/数值/轴/身份/模型、seed=0、缺失指标与 proxy provenance、取消0/k/N帧、runtime 形状与错误原因、UTC/单一时间来源、深层 alias/冻结、跨 Run 隔离、live store/Undo/Redo 独立和真实 Phase 3 dark-only fixture。新增及相关 Phase 3 CCD/Preview/派生/渲染增量测试 5 files / 82 tests 通过；不声明完整 Phase 1～3 测试重跑。lint/build/diff-check 结果见 CURRENT_PHASE.md。

### Phase 4B — Exposure Reuse, Mean & Metrics

**状态：** Completed（工程范围；SNR/OD未定义，最终数值门槛未通过）。

**实施记录（2026-11-08）：** 已完成共享 CCD realization、独立连续 RNG、逐帧 immutable counts、稳定算术均值和既有 proxy/undefined 指标。旧 Preview API/算术/消费顺序不变。3 个相关测试文件62项通过；后续连续实施已获用户授权，full test/lint/build 统一在4F执行。

**依赖：** 4A；遵循 Q1/Q4/Q5 Approved，相关 Open 先收口。

**工作：** 复用共享 CCD realization，保留 Preview API；建立 acquisition adapter、独立 RNG 流、平均与经审核的指标纯函数。不启动 store runtime。

**独立验收：**

- 旧 Preview 固定输入/seed 输出逐值保持；Expected 不变。
- 同 snapshot+RNG provenance 可复现完整 acquisition 序列；同 run 多次 exposure 消费新 draws，不能重复同一随机帧充数。
- N=1 恒等；手算 N=2/3 均值准确；不同 axis/index/run 的 exposure 拒绝聚合。
- counts 有限且在 detector 边界内；零/近零/高 dark/read noise/饱和输入安全；metrics 的 null/reason 与 saturation 边界有测试，不发明 SNR/OD 公式，保留逐帧证据。
- 未加入 baseline/平滑/峰检测；相关测试及 test/lint/build 通过。

### Phase 4C — Acquisition Runtime & Atomic Completion

**状态：** Completed。

**实施记录（2026-11-08）：** 已完成唯一目标解析、冻结输入、idle/running/completed/cancelled/error、分步 scheduler、注入 clock/seed、逐帧接受校验、有限 N 自动结束和原子完成。running 拒绝重启，终态可新建；取消保留帧，error 仅 runtime。2 个相关文件16项测试通过，含 N=1/20、迟到/重复回调、失败恢复；完整验证统一在4F。默认每100ms让出事件循环，integration仅为模拟计数时间，不声称真实硬件等待。

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

**状态：** Completed；4F取消矩阵已扩大至26项。

**实施记录（2026-11-08）：** 科学配置投影比较已接入 commitScene/restoreScene/replaceScene/detector/simulation 公共提交边界，配置更新与取消在同一 Zustand 提交发布。回调前、接受帧前和最终提交前复查配置/token；保留取消帧。21项定向用例覆盖编辑入口、物理Undo/Redo/rollback、非科学操作与等值替换不误取消、曝光/完成竞争。projection 对失效目标只比较科学输入，不重验旧lineage；复制后冻结，避免冻结 live state。完整验证统一4F。

**依赖：** 4C；Q6/Q7 Approved，目标与科学输入身份的 Open 细节先收口。

**工作：** 接入所有科学输入 mutation 提交边界和配置检查，原子取消与原因事件；处理 transaction/Undo/Redo/replaceScene、最终 exposure 竞争。

**独立验收：**

- 运行中改 Mirror、sample、wavelength、detector/integration、simulation 输入等均取消；无新旧输入混合。
- add/delete/paste/duplicate、Undo/Redo、transaction rollback、replaceScene 有覆盖；最后一次 exposure 与修改交错时无非法完成。
- 迟到回调不能更新已取消状态，也不能污染下一次 run。
- selection/camera/grid/clipboard copy/lock/history 记账不误取消；name-only/科学等值替换不误取消，物理 Undo/Redo 必须取消；原因消息可由 UI 消费；相关测试及 test/lint/build 通过。

### Phase 4E — Acquisition UI & Result Inspection

**状态：** Completed；4F浏览器检查通过，窄屏Grid压缩问题已修复。

**实施记录（2026-11-08）：** Single/Average 默认20、Acquire、权威 integration 读数、k/N、completed/cancelled/error、历史选择、冻结expected/raw和snapshot/指标摘要已实现。取消记录不画完整mean；SNR/OD明确Undefined。4项渲染测试及既有Spectrum渲染回归通过。无手动Stop/删除/导出，Preview继续独立随设计派生；真实浏览器与全量验证在4F进行。

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

**状态：** 工程验证和浏览器评审已执行；**总 PRD Exit Gate 未通过**，不标记Phase4 Completed。

**自动验证（2026-11-08）：**

- Targeted：4B/C/D/E各有定向记录；4F增加F/G、跨Run不变性、variance约1/N和资源边界；最终取消矩阵26项（含旋转、批量transform、对齐/分布、谱仪参数及-0等值）。
- Full Tests：npm run test最终59文件/477用例通过，包括原有未跟踪phase3PipelineRegression测试（仅执行，未修改/提交）。首次完整运行发现旧Phase3G smoke期望，按实际UI阶段修正后先定向重跑，再全量通过；未削弱科学验收。
- Lint：npm run lint通过。
- Build：npm run build通过。资源测试先因浏览器TS配置不识别Node全局/导入失败，改为标准TextEncoder后，该3项定向测试与build/lint通过；未添加Node配置/依赖。完整477项通过后仅此测试环境等价修正与文档更新，未重复无关full test。
- git diff --check通过。PRD、依赖和reference未修改。

**实际浏览器（本地Vite/in-app Chromium，2026-11-08）：**

- Single N=1自动完成保存；布局修复后鼠标Acquire再次成功（共观察3个completed、2个cancelled）。
- PRD F工程路径：integration=1s、Average20/20自动结束，显示冻结Expected/Raw。样本Run开始06:21:42.328Z、完成06:21:44.491Z。**SNR/OD显示Undefined，F数值要求未通过。**
- PRD G：运行中在Inspector将Mirror X=200改为210，立即Cancelled；分别观察0/20、1/20，后者保留1帧，取消记录无完整Raw图，不进入Completed。
- integration=0明确拒绝启动；恢复1并Undo恢复Mirror后Single成功。runtime注入故障恢复由自动测试验证；浏览器验证的是invalid-start恢复，不混称两者。
- 编辑/Undo/新采集与切换历史后，旧Average Raw的SVG path和Run ID保持一致。摘要显示冻结Detector、UTC、RNG/模型、proxy单位/来源与Undefined reason。
- 约491px默认窄屏发现Acquisition Grid压至1px，修为max-content与窄屏自然行高后，展开摘要高度约1406px，控件及图可滚动访问、鼠标可用，无Inspector覆盖。未宣称覆盖所有断点。
- 捕获的页面console warning/error列表为空；工具自身Statsig警告不属于应用console。

**资源测量与边界：** 默认1400 bins。Node/fake scheduler样本N20的JSON为1,603,914 bytes，留存估算2,036,736 bytes，计算约0.09～0.20s；N200为13,956,309/18,164,736 bytes，约0.7～1.2s（不是实际integration等待）。采用可注入64MiB会话留存估算预算，合计completed/cancelled及请求N×bins；超量在调度前报错，不驱逐旧Raw。它不是固定产品N上限或跨平台峰值heap保证，验证/序列化临时副本可能显著高于留存估算；大数据浏览器负载和后台节流仍是技术风险。

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
| State machine | 4C fake scheduler 精确步进 N，取消保留第0/k/N帧且无完整结果、error runtime 保留已接受帧及原因、重启、stale token、duplicate start/complete、末帧竞争、资源清理；4A 仅验证数据形状 |
| Store integration | 全部 5.1 mutation 入口和无关 view/editor 操作；Run collection 与 Undo/Redo history 边界；既有 records 不变 |
| Rendering / browser | 模式、N、integration、进度、通知、结果来源、旧 Run snapshot；实际编辑中取消与 UI 响应 |
| Regression | 现有 acquisition/raman/optical/studio 测试；532/633/785nm × Si/PS/Calcite、focus/断路/filter/饱和路径及动态轴 |

现有 `tests/regression/phase3PipelineRegression.test.ts` 在本次检查时未跟踪；后续实施应先核对其归属与维护状态，不静默覆盖或假定已纳入版本基线。

本次用户明确覆盖一般验证节奏：4B～4E用Targeted Tests推进，4F统一full test/lint/build和浏览器检查；后续一般任务仍按AGENTS分层策略，不把本次连续授权解释成永久降低Exit Gate。

## 8. Exit Gate

Phase 4 完成必须同时满足：

- [ ] 影响契约与用户行为的 Open Questions 已审核并写回决策，不以隐式假设实现。
- [ ] 4A～4F 各自独立验收完成。
- [x] Single N=1、Average N>1 使用新 noisy exposures，有限 N 自动结束。
- [x] Instrument Snapshot、每次 exposure 原始 counts 与 raw mean 深层不可变，不被覆盖、重新生成或处理；Cancelled 保留已接受帧、不生成完整结果、不进入 Completed Runs。
- [ ] AcquisitionRun 满足 PRD §42，保存 snapshot、expected/raw、N/integration、所有必需指标字段（Approved availability 策略）和可追溯版本；§4.5 PRD 数值指标验收差异已经明确审核。
- [x] 配置变更立即停止并提示，包含非 Inspector 编辑路径；无跨状态数据、无迟到提交污染。
- [x] Preview 不保存成正式数据，live expected 与历史 expected/raw 来源清楚；共享噪声算法且 Phase 3 回归不变。
- [ ] PRD F/G 在自动测试和实际浏览器通过，编辑器可在采集中响应修改。
- [x] `npm run test`、`npm run lint`、`npm run build` 全部实际通过，浏览器验收有记录。
- [x] 没有提前实现 Phase 5 processing/完整图表、Phase 6 3D、Phase 7 I/O 或 Phase 8 diagnostics/E2E。
- [x] 状态文档按实际完成情况更新，随后停止，不自动推进下一阶段。

未勾选项保留原要求：4A～4E和F/G工程路径已通过；SNR/OD数值定义和PRD最终差异未解决，不能据null/reason宣布整体完成。

## 9. Risks / Open Questions

### 9.1 Approved Decisions 与本次工程选择

2026-11-08：原Q1～Q7/Q9及4A补充约束继续有效。本次用户明确授权连续4B～4F，普通工程细节自主选择并记录，不逐项等待批准；科学定义不得发明。

| ID / 状态 | 原有约束与本次实施 | 边界 / 剩余事项 |
|---|---|---|
| Q1/Q1-R — Implemented | PRD要求保存mean和不可变Raw；批准额外逐帧留存。保留counts/axis/index/clipping和mean，不要求noise arrays。会话64MiB估算预算，超量拒绝、不驱逐旧记录 | 资源估算不保证峰值heap |
| Q2/Q2-R — Implemented | 配置变化必须停止；Cancelled保存cancelled_at、原因和已接受帧，无完整mean，不入Completed。Error只runtime保留帧与原因 | 无手动Stop UI或持久化Error Run |
| Q3/Q3-R — Implemented | Single=1、Average>1；integration有限正数，N正安全整数、默认20。100ms分步加速模拟，integration只影响counts；按实际数据规模和已存记录预检预算 | 没有固定产品N上限或真实硬件时间承诺 |
| Q4/Q4-R — Open numerical gate | PRD §42/§73仍要求指标；复用focus与detected effective power proxy，记录mW/source/model/科学语义。saturation保留expected与逐帧证据。SNR/OD保持null/reason | 不代表PRD数值达标，整体Exit Gate未通过 |
| Q5/Q5-R — Implemented | 每Run crypto独立uint32 seed含0，测试可注入；单流、从0编号、4 draws/bin，算法/消费顺序版本化 | 复现限定同实现/环境，无用户seed UI |
| Q6/Q6-R — Implemented | 无独立选择器。有实际激发时须只有一个actual-hit context，否则仅一个enabled sample context；source与返回谱仪必须唯一，fallback身份须唯一；多source/context/谱仪聚合拒绝 | dark-only仅复用实际CCD可执行配置，不伪造信号；拒绝选择歧义是已批准工程决策 |
| Q7/Q7-R — Implemented | 科学投影为身份依据、revision仅辅助。所有公共提交原子取消、回调重检；实际科学Undo/Redo/rollback取消。忽略name/metadata/view/selection/clipboard copy/lock/history记账，-0与0等价 | 比较投影不重验已失效lineage；复制后冻结，不冻结live state |
| Q8 — Implemented minimum | Preview继续随设计自动重算，不加周期timer、不消费Run RNG；running独立显示进度，不将partial mean冒充完整结果 | 后台任务由浏览器节流，无pause/resume或固定刷新频率承诺 |
| Q9/Q9-R — Implemented | PRD timestamp唯一映射started_at，无双份时间。UTC ISO、可注入Clock、UUID；clock/schema失败为可读invalid-start/error，不伪填倒退完成时间 | Cancelled只用cancelled_at，已有数据保留 |
| Q10 — Implemented minimum | 单active Run，running禁用/拒绝重复Acquire，终态可新建；旧回调失效；历史最小选择completed/cancelled，不删清空 | 记录仅session内存，刷新清空；未做Phase7持久化 |

PRD与工程决定保持区分：逐帧留存、seed/时间格式、资源预算、目标拒绝规则是工程细化；不得据此更改PRD。SNR/OD缺少可靠定义是显式未解决的数值验收差异，不能以null/reason自动关闭。

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

本次连续4B～4F工作到此停止。4B～4E工程完成，4F验证已执行；总PRD Exit Gate因SNR/OD数值定义缺失未通过，等待下一轮审核，不自动进入Phase5。
