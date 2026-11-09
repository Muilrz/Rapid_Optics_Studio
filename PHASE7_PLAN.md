# Phase 7 — Project & I/O

基线 2a64f0a。依据 PRD §§36、55–60、76、78。7A–7F 连续开发，统一提交验收。

| 批次 | 交付与验证 |
| --- | --- |
| 7A | 严格项目 v1 契约，复用光学、材料、CCD 和 Completed Run 校验。验证 ID、谱轴、流程与参考归属。 |
| 7B | 独立 JSON 编解码和版本分派。验证结构拒绝、数值边界与无损往返。 |
| 7C | 准备全部恢复结果后一次 Store 提交。验证失败保留原状态、迟到任务隔离、文件取消与覆盖语义。 |
| 7D | 配置 JSON、明确选种类的 Spectrum JSON/CSV、图形 PNG/SVG、材料 CSV 与独立 Demo 适配。验证单位、来源和错误行。 |
| 7E | 将分析与项目文件操作接入 Studio。验证历史 Run、处理重放、编辑器和 3D 同步。 |
| 7F | Chrome Scenario I、文件交互与测量，全量测试、Lint、Build、Diff Check。记录证据后更新状态与阶段标识，检查远端后正常提交推送。 |

## 持久化契约

- 文件使用 `format: rapid-optics-project` 和 `schemaVersion: 1.0`。项目身份在 New 时创建，Save As 保留身份。创建与更新时间使用 UTC。保存生成的更新时间只在文件操作成功后采纳。
- 投影权威 Scene、Simulation、Detector、Custom Materials、Completed Runs、分析数据、谱库与持久视图偏好。Run 的所有 Snapshot、Expected、Raw、Exposure、指标及版本按原值恢复。以 Run ID 派生谱 ID，避免在库中复制冻结数组。Process 仅按冻结 Raw 和版本化 Pipeline 重放。
- Selection、Clipboard、锁定、Undo/Redo、指针、视口尺寸、WebGL 与异步任务为运行时数据。Grid、Snap 和 2D 相机为持久偏好，3D 会话控件重置。Live Trace、Raman 和 Expected 在打开后从新配置重新计算。
- 项目没有已发布的旧 schema。未知版本报错，Demo 使用独立适配器。只接受能确定数据语义的旧格式，对依赖未保存科学参数的 Demo 配置给出解释。任何迁移须检查完整输入并再次通过目标 schema。

## 文件操作与事务

- 原生句柄支持覆盖和另存为。回退使用显式下载副本和文件选择，状态区提示浏览器下载的语义。保存捕获一致快照，若写入期间发生修改，仍提示未保存。保存可在采集中进行，仅包含已完成记录。
- 打开先读取、验证、重算与准备，再原子发布。成功切换会废弃采集 token，清空工作区临时状态。失败或取消时保持原工作区。New/Open 提示未保存修改及将停止的采集。
- 限制字节、嵌套、数组和处理复杂度，在 Chrome 实测保存与恢复。大文件采用浏览器文本读写，保留完整科研数组。

## 验收边界

验证 PRD Scenario I 后继续编辑、采集、分析、保存。附加覆盖异常数据、跨 Run 隔离、文件权限与取消、图形可用性、3D 同步及真实浏览器时序。保留工作区已有未跟踪测试，边界止于 Phase 7。

## 文件格式与兼容边界

- Project JSON 包含权威设计、配置、材料、Completed Runs、导入谱库、分析编辑及视图偏好。复用 Phase 4 的版本和关联校验，并用原有均值算法核对冻结 Raw 与帧数据的一致性。文件中的 Raw、Expected 和快照作为记录直接恢复。
- Optical Configuration JSON 使用独立 `rapid-optics-optical-configuration` v1 标签，包含 Scene、Simulation、Detector 与材料定义。导入替换当前设计，保留项目身份和历史。材料同 ID 不同定义时拒绝导入。
- Spectrum JSON 明确保存种类、源 Run ID、采样轴、数值、单位、来源、饱和证据与 Processed Pipeline。CSV 使用 `raman_shift_cm-1` 和 `intensity_counts_per_bin` 或 `intensity_dimensionless`。第三列只在首条采样行保存带版本的 JSON 元数据。SVG 和 PNG 输出所选光谱的完整采样域及单位。
- Demo `raman-spectrum` v1 可导入独立谱库。按其实际导出路径标记为舍入后的 Expected，保留旧元数据，饱和证据为未知。拒绝缺少可验证种类的裸数组和缺少正式仪器参数的 Demo 像素布局。正式 Project v1 无先前发布版本，未来版本明确拒绝。
- 材料 CSV 使用 `shift_cm-1,relative_intensity,fwhm_cm-1`。FWHM 除以二转换为当前 Lorentzian 半宽，任一非法行使整个导入失败。名称与荧光由用户输入。
- 使用原生句柄保存时以写入流成功关闭为提交点。下载回退无法确认浏览器是否保存到磁盘，因此保留未保存提示。打开下载副本可验证并恢复。项目文件限制 128 MiB、嵌套 40 层、单数组 100 万项、总结构 1200 万项。解析、校验复制、JSON 编码与图形绘制可能同时占用主线程和内存。保留逐帧数组和历史快照是主要文件体积来源，未测上限文件或峰值内存。

## 验收记录

7A–7F 已完成。7F 结合工程检查、Chrome 兼容路径 Scenario I 和用户对 Chrome 原生文件路径的人工验收确认。

- Targeted Tests 通过 25 文件、245 项，含新增 Project I/O 测试与现有 Studio、Acquisition 回归。
- Full Tests 通过 63 文件、513 项，含工作区已有未跟踪的 Phase 3 回归文件。Lint、Build 和 Diff Check 通过。Build 有现有 3D 分块尺寸提示。
- Chrome 157 Headless，Windows，1600 × 1120，实际 Vite DOM、文件选择事件、下载与 WebGL。使用禁用原生选择器的兼容路径，编辑 Mirror 位姿与反射率，修改最大光线数、探测器积分时间，导入自定义材料并完成 20 帧与单帧两条 Run。应用 Baseline、Smoothing、Normalize、峰检测、手动峰、参考指派和跨 Run Overlay。
- 下载后刷新并通过浏览器文件选择重开。逐字段比较项目文件、恢复的设计、材料、两条完整 Run、Pipeline、峰编辑及 Overlay。核对重算 Trace、Expected 和渲染后的叠加曲线一致。清除临时选择后，同一 3D 顶视图的截图 SHA-256 一致。验证损坏引用拒绝并保留原工作区、拒绝丢弃未保存修改后仍留在当前项目、恢复后追加第三条 Run 并下载另存副本。
- 实际下载 Expected、Raw、Processed 的 JSON 和 CSV，核对来源、Raw 数值与单位。Processed PNG 为 1920 × 1000、428,531 字节，SVG 为 22,836 字节，包含曲线、坐标、单位和图例。该次浏览器脚本记录零未捕获异常。
- 上述两条 Run 文件为 1,539,481 字节。一次测试从触发 Save 到检测到下载文件约 143 ms，从触发 Open、提交文件到 UI 操作完成约 326 ms。包含浏览器与 CDP 调度，未分离测量解析、校验或渲染。追加第三条 Run 后的文件为 2,850,151 字节。
- 桌面 Chrome 控制因当前 URL 无法可靠识别而停止。原生文件选择、权限与覆盖验收未完成。Chrome 兼容路径证据采自最终工程门槛前的开发构建。

### 7F 原生文件路径收尾

| 证据类别 | 结果 |
| --- | --- |
| 自动化已验证 | 已有 Chrome 兼容路径 Scenario I 覆盖无效 Open、拒绝丢弃修改、恢复 Completed Run、Raw、Snapshot、Pipeline、Peak、Overlay 和 3D，同一项目恢复后成功追加 Run。定向测试验证项目替换只发布一次、迟到采集回调失效、已有句柄写入失败时中止流。 |
| 人工已验证 | 2026-11-09，用户确认 Chrome 原生路径人工验收无问题。该确认是整体验收结果。 |
| 证据边界 | 桌面自动化未操作原生弹窗。用户未提供逐项哈希或写权限拒绝的单独记录。写入失败回归测试覆盖流中止。 |
| 确认存在的缺陷 | 已修复 Studio 根网格仍按两行布局的问题。Project 控件加入后，工作区被放到隐式行，可能超出视口。Chrome 157 实测 1440 × 900 和 390 × 844 下 Save As 可点击，工作区底部位于视口内。 |

人工验收在已打开的 `http://localhost:5173/` 进行。使用两个专用测试文件 A 和 B，并记录其完整路径。原生路径成功时，项目栏显示 `Saved <文件名>` 或 `Opened <文件名>`，并显示关联文件名。若显示 `Download requested`，该操作属于兼容路径。

1. 将项目名改为 `Native A1`。点 **Save As**，在原生弹窗选择 A。确认 A 出现在选定位置，项目栏显示 `No unsaved changes`，磁盘 JSON 的 `metadata.name` 为 `Native A1`。记录 A 的哈希。
2. 将名称改为 `Native A2`，切换 Grid，再点 **Save**。确认 A 原路径的哈希已变，JSON 的名称和 `viewState.gridVisible` 匹配界面，没有新增下载文件。刷新页面，用 **Open Project** 选择 A，核对名称、Grid、关联文件名和干净状态。记录此时 A 的哈希。
3. 将名称改为 `Native B1`，点 **Save As** 选择 B。确认 B 的名称为 `Native B1`，且 A 的哈希保持第二步的值。将名称改为 `Native B2`，点 **Save**。确认只更新 B。核对磁盘 JSON 的名称、Grid、项目 ID，再从磁盘重开 B，确认界面恢复一致。
4. 保持 B 关联，修改名称使项目变脏。分别打开 **Open Project** 和 **Save As**，在原生弹窗取消。确认名称、关联文件和 `Unsaved changes` 保留，A/B 哈希不变。
5. 若 Chrome 在给测试目标申请写权限时显示拒绝选项，拒绝后核对写入失败反馈、当前修改和关联文件保留、Dirty State 仍为 `Unsaved changes`，且 A/B 哈希不变。环境未出现可拒绝的写权限请求时，该项保持 Pending。取消选择器只能证明取消分支。

可用 PowerShell 的 `Get-FileHash -Algorithm SHA256 -LiteralPath '完整文件路径'` 记录内容哈希，用 `Get-Content -Raw -LiteralPath '完整文件路径' | ConvertFrom-Json` 查看 JSON。保留 A/B 各次检查的哈希、界面反馈和权限拒绝结果。原生必验项通过后再运行最终工程门槛、更新阶段状态、提交并推送。
