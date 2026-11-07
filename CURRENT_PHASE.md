# Rapid Optics Studio — Current Development Status

> **Updated:** 2026-11-08 (Asia/Singapore)  
> **Implemented baseline:** Phase 3 + Phase 4A Acquisition Contracts<br>
> **Current task:** Phase 4A 已完成，等待审核<br>
> **Review state:** 4A Exit Gate 通过；4B～4F 未开始；SNR/OD 数值与 PRD 最终验收差异仍待后续审核

## 状态与证据

- Phase 0～2 已有工程、Optical Core 和 2D Studio 实现；Phase 3 的完成声明及 2026-11-08 Edge 验收记录保留在 [PHASE3_PLAN.md](PHASE3_PLAN.md) 第 3G 节。
- 当前代码新增 AcquisitionRequest/Exposure/Raw/InstrumentSnapshot/Completed/Cancelled Run/Runtime 契约、strict Zod 校验、深层 readonly/freeze、科学配置数据投影与 fixtures；尚无正式曝光生成、Average N 算法、采集执行/调度、取消接线或 UI。
- 科学核心不依赖 React/Zustand/DOM；未改变既有 Phase 3 CCD/Preview/RNG API，未增加依赖或 Project 文件 schema。Run 数据不写入 Store/Editor History。
- Q1-R/Q2-R/Q3-R/Q4-R/Q5-R/Q6-R/Q7-R/Q9-R 契约方向 Approved 并实现；SNR/OD null/reason 仅通过4A，不声明满足 Phase 4 数值验收。剩余 Deferred/Open 详见 PHASE4_PLAN.md §9.1。
- 本次验证：新增及相关 Phase 3 增量测试 5 files / 82 tests passed（其中新增44项）；`npm run lint`、`npm run build`、`git diff --check` 均通过。按用户最新要求未运行 full test；大阶段验收再运行。无交互行为修改，未运行浏览器验收，不以历史记录替代。
- 工作区原有未跟踪文件 `tests/regression/phase3PipelineRegression.test.ts` 未添加、修改、删除或纳入本次增量测试，不以本任务确认其归档状态。
- 应用代码 `src/app/stage.ts` 的 UI 标记仍为 Phase 3G；4A 仅新增未接线的核心数据契约，不提前改变运行中的 UI。

## 前次文档整理记录（历史）

| 文档 | 职责 | 本次处理 |
|---|---|---|
| [PRD.md](PRD.md) | 产品需求、科学约束、验收标准 | 保持原样 |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phase 0～8 总路线、架构基线、依赖、阶段 Exit Gate、专项索引 | 移出 Phase 0/1 详细施工章节，纠正末尾过时的 Phase 0 下一步指令 |
| [PHASE0_PLAN.md](PHASE0_PLAN.md) / [PHASE1_PLAN.md](PHASE1_PLAN.md) | 已完成早期阶段的详细施工历史 | 从原总体计划原意迁出；未重新验证历史完成证据 |
| [PHASE3_PLAN.md](PHASE3_PLAN.md) | Phase 3 详细施工与历史验收 | 保持原样，不写入 Phase 4 细节 |
| [PHASE4_PLAN.md](PHASE4_PLAN.md) | Phase 4 详细施工草案 | 新增，明确建议、已确定约束与待确认项 |
| 本文件 | 当前状态、审核点、下一步边界 | 新增，集中动态进度 |
| [README.md](README.md) | 仓库入口、简短状态、命令与链接 | 缩短状态重复，补充入口 |
| [AGENTS.md](AGENTS.md) | Agent 执行规则及文档使用规则 | 补充专项计划与状态文档职责 |

## 结构问题与处理结论

1. **过时状态指令：** 总体计划末尾仍要求下一步 Phase 0，与 Phase 3 Completed 记录不一致。现改为引用本文件，不改写早期施工历史。
2. **状态重复：** README 长段状态、Phase 3 顶部状态、应用标记职责不清。动态进度集中于本文件；历史完成日期保留于原专项计划，README 仅摘要，应用标记差异如上记录。
3. **职责缺失：** AGENTS 未解释 `PHASE*_PLAN` / `CURRENT_PHASE`；总体计划没有专项索引。现已补齐。
4. **详细计划分布不一致：** Phase 0/1 原来嵌在总体计划，Phase 2 没有独立计划，Phase 3 起采用独立文件。现将 Phase 0/1 详细内容迁入独立历史计划；Phase 2 明确标注“无独立计划留存”，不根据代码倒推或补造历史。
5. **Preview 跨阶段表面重叠：** PRD 第 80 节把 Preview 列在 Phase 4，Phase 3 已提供该原语和 UI。这是依赖前置，不删产品要求；Phase 4 复用并验证预览与正式采集的区别。
6. **技术建议差异：** PRD 的 Node/monorepo/库推荐与当前 browser-only 单项目决策不同，已有总体计划第 3.3、5.1 的解释。继续按工程职责使用现行基线，不改 PRD，不重开架构。
7. **局部说明落后代码：** `src/core/acquisition/README.md` 开头声称仅 Phase 3D/no preview，后文却描述 Phase 3E，代码也已有 seeded noise。该局部措辞整理留待后续获授权维护，本次不扩展为模块文档清理。
8. **需求不等于已有指标实现：** PRD 要求 Run 保存 Rayleigh OD / SNR；当前 SpectrumPreview 未见这两个读数，代码也未见可直接复用的对应 Run 指标函数。Phase 4 必需 Run 指标列入专项计划，公式与边界列为 Open Questions；不把缺口笼统推迟到 Phase 8，也不因此否定已有 Phase 3 历史记录。

## 前次 Decision Review（历史）

- 已将用户明确确认的 Q1～Q7、Q9 决策写入 [PHASE4_PLAN.md](PHASE4_PLAN.md) §9.1，更新 Data Contracts、State Machine、逐子阶段与总体测试要求；Approved 不等于 4A 完成。
- 逐帧 CCD counts 与完整 raw mean 均不可变；Cancelled 保留已完成帧但无完整结果，不进入 Completed Runs；正式 integration >0、Average 默认 N=20，无未经资源测试的产品上限。
- 复用 Phase 3 可靠指标；无定义的 SNR/OD 用 null + reason。PRD 未明确 null 的数值验收含义，差异显式待审，不改 PRD。History 记账不取消，但 Undo/Redo 改变科学输入仍取消。
- RNG/sampler version、独立 seed、点击时配置 snapshot、科学配置 revision/等效机制、UTC startedAt/completedAt 和可注入 Clock 已批准；剩余细节、Q8/Q10 仍 Open。
- 本次无生产代码、测试、依赖或 reference 修改；不运行功能验证，仅检查文档 diff。原有未跟踪回归测试保持原样，不纳入提交。

## 下一步与停止边界

1. 审核本次 4A 契约及测试；4A 已完成，Phase 4 整体未完成。
2. 下一个子阶段为 4B Exposure Reuse, Mean & Metrics；先审核适用 Deferred（尤其数值指标定义/资源测试），明确授权后才实施。
3. 未实现4B曝光/平均/指标算法、4C调度/转移、4D取消接线、4E UI 或 Phase 5～8；reference、依赖、PRD、原有未跟踪测试保持原样。
4. 本次验证后按用户授权提交并 Push 至 origin/main，随后停止等待下一轮审核。
