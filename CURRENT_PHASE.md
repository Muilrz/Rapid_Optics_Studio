# Rapid Optics Studio — Current Development Status

> **Updated:** 2026-11-08 (Asia/Singapore)<br>
> **Implemented baseline:** Phase 4 — Acquisition Completed<br>
> **Current task:** Phase 4 最终验收收尾完成，提交后停止<br>
> **Review state:** 总PRD Exit Gate **通过**；正式1s×20 F与配置取消G均有真实UI证据

## 当前能力与边界

- 4A契约基线893a0b6；分层测试规则f0b2803。本次连续授权优先：4B～4E定向推进，4F统一完整验证。
- 4B：共享Phase3 CCD噪声realization、每Run独立连续RNG、N次新exposure、稳定算术均值、immutable逐帧/mean；Preview API/固定seed行为保持。
- 4C：冻结Scene/Simulation/Material/Spectrometer/Detector，唯一目标解析；idle/running/completed/cancelled/error；可注入scheduler/clock/seed，有限N自动结束、原子完成、迟到回调保护。
- 4D：公共科学提交边界原子取消，含Undo/Redo/transaction rollback/replaceScene、detector/simulation；科学投影为真值。选择/视图/clipboard copy/lock/name-only和history记账不误取消。
- 4E：Single/Average、Acquire、k/N、取消/错误提示、历史选择、冻结Expected/Raw、snapshot/指标摘要；使用历史自身axis/full well。窄屏Grid压缩已修复。
- Run数据不混入Editor History；无新依赖、后端、Project I/O或Phase5～8功能。取消保留帧、不生成完整mean；Error仅runtime保留数据。
- 既有numericalMetrics.ts：Rayleigh路径OD=−log10(T)，参考Sample回光至Spectrometer输入，记录T/λ/来源/版本；不是厂家标定滤片光谱OD。Peak SNR为冻结Raman-only最强bin的N均值高斯模型预测，记录bin/S/σ/N/波长/来源/版本，非实测SNR。
- 无路径/波长、T=0、无Raman峰、饱和或选定bin裁剪等情况保留明确Undefined。旧Run不重算、Raw不处理。缺少厂家T(λ,AOI,polarization)与完整硬件噪声/转换标定，不能推断校准硬件指标。
- PRD §73只固定Integration=1s、N=20，未限定默认光路或Laser功率。此前把默认10mW饱和视作F必然阻塞，属于场景约束过严。正式F只将已有Laser改为0.1mW，其余默认7元件、532nm、Silicon、Detector gain=340 / full well=60000均不变，获得有限Peak SNR。默认10mW的饱和Undefined保留，不修改公式/clipping/PRD。

## 实际验证

| 类别 | 结果 |
|---|---|
| Targeted Tests | 本次6文件56项通过：F/G、runtime、取消、数值指标、渲染及阶段smoke |
| Full Tests | 本次未运行；公共科学核心/契约/全局状态机制未改。历史科学基线6d1f41d已运行npm run test：60文件490项通过，不冒充本次执行 |
| Lint | npm run lint passed |
| Build | npm run build passed |
| Diff | git diff --check passed |
| Browser | 正式0.1mW、1s×20：Peak SNR≈133.65、OD≈7.4867（available），20×1400-bin帧及1400-bin Raw Mean完整保存；live改变/新Run/历史切换后Snapshot与Raw不变。默认10mW同样1s×20仍饱和Undefined；G在2/20移动Mirror立即取消且不污染F。页面console warning/error为空。详见PHASE4_PLAN §4.8 |

本次新增合法F fixture，逐bin独立求和核对20帧均值，并在live修改、Undo/Redo后深度比较整个Run；默认场景增强饱和/clipping与Undefined断言。只读审计UI显示冻结Laser和实际保存数组维度；不改科学核心、契约或状态机制。历史完整验证记录保留于阶段计划，不冒充本次新增证据。

详细浏览器和资源测量见PHASE4_PLAN.md第4F节。1400-bin样本N20/N200的JSON约1.60MB/13.96MB；会话64MiB留存估算预算按N×bins及旧记录共同预检，超量拒绝、不驱逐Raw。预算不是峰值heap保证；后台节流会延长墙钟时间，session数据刷新即丢失。

## Git与停止边界

- 4B～4F及数值闭环原提交保留；本次仅只读审计UI、验收fixture/回归和阶段状态，无科学算法/契约/调度变更或新依赖。
- 原有未跟踪tests/regression/phase3PipelineRegression.test.ts保持原样，不静默纳入版本基线。
- PRD、reference、依赖保持原样。应用阶段标签为Phase 4 — Acquisition Completed。
- Phase4 Exit Gate已通过；本次提交并Push后停止。Phase5未开始，后续实施需新授权。
