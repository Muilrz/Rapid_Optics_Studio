# Rapid Optics Studio — Current Development Status

> **Updated:** 2026-11-08 (Asia/Singapore)<br>
> **Implemented baseline:** Phase 3 + Phase 4A～4E acquisition engineering<br>
> **Current task:** 本次连续4B～4F授权已执行，停止等待审核<br>
> **Review state:** 4F工程/浏览器验证已执行；Phase 4总PRD Exit Gate **未通过**（SNR/Rayleigh OD数值定义缺失）

## 当前能力与边界

- 4A契约基线893a0b6；分层测试规则f0b2803。本次连续授权优先：4B～4E定向推进，4F统一完整验证。
- 4B：共享Phase3 CCD噪声realization、每Run独立连续RNG、N次新exposure、稳定算术均值、immutable逐帧/mean；Preview API/固定seed行为保持。
- 4C：冻结Scene/Simulation/Material/Spectrometer/Detector，唯一目标解析；idle/running/completed/cancelled/error；可注入scheduler/clock/seed，有限N自动结束、原子完成、迟到回调保护。
- 4D：公共科学提交边界原子取消，含Undo/Redo/transaction rollback/replaceScene、detector/simulation；科学投影为真值。选择/视图/clipboard copy/lock/name-only和history记账不误取消。
- 4E：Single/Average、Acquire、k/N、取消/错误提示、历史选择、冻结Expected/Raw、snapshot/指标摘要；使用历史自身axis/full well。窄屏Grid压缩已修复。
- Run数据不混入Editor History；无新依赖、后端、Project I/O或Phase5～8功能。取消保留帧、不生成完整mean；Error仅runtime保留数据。
- SNR/OD仍为null + reason，不构造未经批准的科学公式；功率为带mW/source/model/科学语义的effective proxy。PRD §42/§73数值验收仍未满足，不能宣布Phase4全部Completed。

## 实际验证

| 类别 | 结果 |
|---|---|
| Targeted Tests | 4B核心/Preview、4C状态调度、4D取消（最终26项）、4E渲染；4F F/G、不变性、统计与资源边界通过 |
| Full Tests | npm run test：59 files / 477 tests passed |
| Lint | npm run lint passed |
| Build | npm run build passed |
| Diff | git diff --check passed |
| Browser | 本地Vite/in-app Chromium：Single、1s×20 Average、Mirror移动取消（0/20与1/20）、invalid integration恢复、历史Raw不变、取消记录无完整图、快照与Undefined指标、修复后鼠标可用；页面console warning/error为空 |

首次完整验证发现旧阶段smoke期望、测试prefer-const与资源测试Node类型问题；定位并定向重跑后修正。477项完整测试通过之后，仅将资源测试的Node字节计数等价替换为TextEncoder，重跑该3项及lint/build通过；未无意义地重复full test。Phase3未跟踪测试在完整测试中被执行，仍未修改或提交。

详细浏览器和资源测量见PHASE4_PLAN.md第4F节。1400-bin样本N20/N200的JSON约1.60MB/13.96MB；会话64MiB留存估算预算按N×bins及旧记录共同预检，超量拒绝、不驱逐Raw。预算不是峰值heap保证；后台节流会延长墙钟时间，session数据刷新即丢失。

## Git与停止边界

- 4B、4C、4D、4E分别形成中文提交；4F提交包含最终回归/资源防护/布局修复/真实状态记录。
- 原有未跟踪tests/regression/phase3PipelineRegression.test.ts保持原样，不静默纳入版本基线。
- PRD、reference、依赖保持原样。应用阶段标签已显示Phase4及numerical SNR/OD pending。
- 本次按授权提交并Push至origin/main后停止。下一步仅等待审核及SNR/OD科学定义/验收差异处理；不自动进入Phase5。
