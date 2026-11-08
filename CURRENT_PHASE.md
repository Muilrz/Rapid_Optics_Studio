# Rapid Optics Studio — Current Development Status

> **Updated:** 2026-11-08 (Asia/Singapore)<br>
> **Implemented baseline:** Phase 3 + Phase 4A～4E + Numerical Metrics Closure（有限模型有效域）<br>
> **Current task:** 数值指标闭环已实现并验证，停止等待审核<br>
> **Review state:** 总PRD Exit Gate **未通过**（默认1s×20峰饱和，无有效线性Peak SNR；不再是缺少数值定义）

## 当前能力与边界

- 4A契约基线893a0b6；分层测试规则f0b2803。本次连续授权优先：4B～4E定向推进，4F统一完整验证。
- 4B：共享Phase3 CCD噪声realization、每Run独立连续RNG、N次新exposure、稳定算术均值、immutable逐帧/mean；Preview API/固定seed行为保持。
- 4C：冻结Scene/Simulation/Material/Spectrometer/Detector，唯一目标解析；idle/running/completed/cancelled/error；可注入scheduler/clock/seed，有限N自动结束、原子完成、迟到回调保护。
- 4D：公共科学提交边界原子取消，含Undo/Redo/transaction rollback/replaceScene、detector/simulation；科学投影为真值。选择/视图/clipboard copy/lock/name-only和history记账不误取消。
- 4E：Single/Average、Acquire、k/N、取消/错误提示、历史选择、冻结Expected/Raw、snapshot/指标摘要；使用历史自身axis/full well。窄屏Grid压缩已修复。
- Run数据不混入Editor History；无新依赖、后端、Project I/O或Phase5～8功能。取消保留帧、不生成完整mean；Error仅runtime保留数据。
- 新增numericalMetrics.ts：Rayleigh路径OD=−log10(T)，参考Sample回光至Spectrometer输入，记录T/λ/来源/版本；不是厂家标定滤片光谱OD。Peak SNR为冻结Raman-only最强bin的N均值高斯模型预测，记录bin/S/σ/N/波长/来源/版本，非实测SNR。
- 无路径/波长、T=0、无Raman峰、饱和或选定bin裁剪等情况保留明确Undefined。旧Run不重算、Raw不处理。缺少厂家T(λ,AOI,polarization)与完整硬件噪声/转换标定，不能推断校准硬件指标。默认PRD F峰饱和，整体仍未通过；未修改PRD或默认增益/full well来“过关”。

## 实际验证

| 类别 | 结果 |
|---|---|
| Targeted Tests | 本次5文件71项通过，新增13项数值/边界/契约/渲染测试；既有Preview与采集回归保留 |
| Full Tests | npm run test：60 files / 490 tests passed（公共契约扩展后最终运行一次） |
| Lint | npm run lint passed |
| Build | npm run build passed |
| Diff | git diff --check passed |
| Browser | 本次：0.01s×20 Peak SNR≈133.65、OD≈7.4867；改live integration不改变旧指标；1s×20 SNR因饱和Undefined、OD仍有限；页面console warning/error为空。原4F采集/取消验收记录见PHASE4_PLAN |

本次旧测试的“OD必为null”期望按新增可靠模型语义更新；默认饱和SNR仍明确断言Undefined。历史Undefined fixtures保持可读、不重新解释。Phase3未跟踪测试在完整测试中被执行，仍未修改或提交。原4F的477项记录与初次失败修正过程保留于阶段计划，不冒充本次新增证据。

详细浏览器和资源测量见PHASE4_PLAN.md第4F节。1400-bin样本N20/N200的JSON约1.60MB/13.96MB；会话64MiB留存估算预算按N×bins及旧记录共同预检，超量拒绝、不驱逐Raw。预算不是峰值heap保证；后台节流会延长墙钟时间，session数据刷新即丢失。

## Git与停止边界

- 4B～4F原提交保留；本次数值闭环仅扩展指标计算/availability契约、展示和测试，不改调度/取消/编辑器历史，无新依赖。
- 原有未跟踪tests/regression/phase3PipelineRegression.test.ts保持原样，不静默纳入版本基线。
- PRD、reference、依赖保持原样。应用阶段标签为Phase4及final acceptance pending。
- 本次按既有Phase4交付授权提交并Push后停止。下一步为默认F饱和域/数值验收差异处理，不能以降低integration的样例代替默认F通过；不进入Phase5。
