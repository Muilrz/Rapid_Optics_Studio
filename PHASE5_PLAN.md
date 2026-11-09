# Phase 5 — Spectrum Analysis

基线为 Phase 4 完成提交 8d5dce8。范围按 PRD §43–48、§75 与总体工程计划执行。

| 子阶段 | 实现与验证证据 |
|---|---|
| 5A 数据契约 | 仅从 Completed AcquisitionRun 取得 Raw Mean。Run ID、派生 Spectrum ID、步骤顺序、参数、开关和算法版本随处理结果保留。Scenario H 对整个 Run（含 Snapshot 和 Exposure）做深度比较。 |
| 5B 处理 | 纯 TypeScript 的 baseline、smoothing、normalize 按步骤列表顺序执行。测试覆盖手算结果、空/零/常数/短输入、非法值、顺序、参数、关闭、删除和 Reset。 |
| 5C 谱峰 | 自动检测、手动选 bin、忽略与恢复、删除、FWHM、参考标记与手动 assignment。测试以已知峰、噪声和非均匀采样轴核对位置、强度和插值宽度。 |
| 5D Viewer | SVG 叠加按各谱原生轴绘制，跨 Run 无重采样。Counts 与无量纲结果分轴。Chrome 验证缩放、按钮和拖拽平移、Cursor、图例开关、自定义窗及 PS 高波数窗。 |
| 5E 接线 | 每个 Run 独立保存 Pipeline，峰编辑按谱图 ID 保存，Overlay 记录可见谱图 ID。React 会话状态通过只读订阅取得 Completed Runs。Chrome 在第二次采集中操作 Pipeline 后确认该 Run 正常完成，再在两条历史 Run 间切换。 |
| 5F 验收 | Scenario H 定向测试及 Chrome 端到端交互，完整测试、Lint、Build 与 Diff Check。 |

## 算法定义

- Baseline Correction 对半径 r 的平坦滑动窗口先取最小再取最大，得到形态学开运算背景，输出原强度减该背景。默认 r=20，整数范围 1–200 bins。边缘窗口与采样域取交集。适用于背景随波数缓变、峰比结构元素窄的谱。宽峰可能被部分扣除，边缘受截窗影响。
- Smoothing 是半径 r 的等权滑动平均，默认 r=2，整数范围 1–200 bins。边缘和短数组按实际窗口内样本数求均值。窗口按 bin 定义，平滑可改变峰高与宽度。
- Normalize 默认使用 y/max(abs(y))，全零保持零。Min–max 使用 (y−min)/(max−min)，常数映射到零。归一化后 Y 为无量纲。算法接受空输入并拒绝非有限强度、非法参数及超出有限表示范围的结果。
- 自动检测取局部极大值，平台峰取中间靠左 bin。两侧分别扫描到更高样本之前或轴端，较高一侧谷底用于定义 prominence。默认阈值为全谱峰谷范围的 10%，可调 1–100%。FWHM 为相对该局部基线的半高宽，取两侧首次交叉并在真实波数轴上线性插值。无双侧可定义宽度时显示 Undefined。手动峰锚定样本 bin，Pipeline 更新后位置保持，强度和宽度按当前结果计算。
- 参考位置和文字来自 Run 冻结的 Silicon、Polystyrene、Calcite 材料定义。参考标记与测量点分别绘制。测量峰可由用户关联参考条目，关联表示参考注释。

## 验收记录

- Targeted Tests 通过 4 文件、23 项，包含分析、Phase 3 集成和动态轴、Phase 4 F/G。
- Full Tests 通过 61 文件、496 项，含工作区原有未跟踪 Phase 3 回归文件。该文件保留在工作区。
- Lint、Build、Diff Check 通过。
- Chrome Headless 使用 Vite 开发应用的实际 DOM 和浏览器指针事件。验证三步处理、逐步关闭及恢复、参数编辑、单步恢复默认、删除、Reset 恢复同一条 Raw 曲线、自动与手动峰、FWHM、参考关联、两条不同轴的历史 Raw 叠加、Expected/Raw/Processed 显隐、采集进行中编辑、PS 十条参考标记和覆盖 3054 cm⁻¹ 的 Auto Window、2800–3100 cm⁻¹ Custom Window、390px 控件可访问。页面 console warning/error 为零。

分析状态仅保存在会话内。不同单位的曲线使用独立纵轴，Cursor 报告各谱最近的实际样本。图中饱和提示沿用冻结 Expected mask 或逐帧高位裁剪证据。项目持久化由 Phase 7 处理。开发边界止于 Phase 5。
