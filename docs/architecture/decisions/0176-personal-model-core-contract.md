# ADR-0176：Personal Model P1a 核心共享契约

日期：2026-08-11

状态：已采纳

## 背景

ADR-0175 接受了长期 Personal Model 的领域边界，但第 181 轮只有设计，没有可供数据库、API 或客户端共同复用的机器契约。若直接进入迁移或页面实现，Goal/Constraint/Preference 与系统观察可能被任意 JSON 混合，证据/置信计数可能漂移，Unknown 也容易再次被编码成“全零行为”。

P1 的完整范围还包括不可变 item revision、反馈后的状态转换和 Weekly Cognitive Review 信封。为保持一轮一范围，本轮先完成 P1a：只锁定三个首批 claim、EvidenceReference/EvidenceSet、置信收据、状态/决策资格、显式 Unknown 和追加反馈事件；P1b 另轮完成 revision/review。

## 决策

1. 新增 `personal-model.constants.ts` 与 `personal-model.ts`，通过 `packages/contracts` 根导出；当前不新增 API、OpenAPI、数据库表、领域派生器或客户端调用。
2. `personalModelItemSchema` 只接受三个严格 `claimSchemaVersion` 分支，并把类型、主题和来源同时锁定：
   - `training_availability_constraint_v1` = Constraint + `training.availability` + `user_confirmed`。
   - `recorded_training_frequency_behavior_v1` = Behavior + `training.recorded_frequency` + `deterministic_rule`。
   - `recorded_session_duration_baseline_v1` = Baseline + `training.recorded_session_duration` + `deterministic_rule`。
3. 当前联合不接受 Goal、Preference、State、Pattern 或 Hypothesis item，也拒绝 claim 额外字段，因此不能在 P1a 对象中加入因果解释、人格标签或自由文本权威结论。
4. 首批 EvidenceReference 只接受 `onboarding_goal_revision` 与 `workout_revision`。引用绑定 owner、聚合 UUID、正 revision、时间、来源、支持/反对/上下文角色、资格和撤回原因；撤回引用只能保留为 context。
5. EvidenceSet 必须复核所有者、窗口、截至时刻、引用/聚合修订唯一性、included/supporting/contradicting/withdrawn 计数和规范 SHA-256 指纹表示。当前完整引用最多 800 条；分页属于后续 API 契约。
6. 置信收据分为本人确认与纵向观察。本人确认分支只证明用户在某修订表达了约束；纵向分支公开证据数、不同本地日期、完整周、比较/稳定窗口、反对证据、最新证据和限制。计数必须与 claim/EvidenceSet 一致，不接受 LLM 自评分。
7. 已记录频率 claim 保存 1–8 个完整本地周的逐周记录课次数，并确定性复核总数、非零周数、最小/最大和 `numeric-median-v1`。全部为零不形成 item。
8. 历时时长 Baseline 使用 `elapsed-duration-minutes-v1`，值范围为大于零且不超过 1,440 分钟；四分位版本为 `nearest-rank-quartiles-v1`。P3 实现时按升序样本的 `ceil(p*n)` 位置计算 Q1/Q3，中位数继续使用奇数中点、偶数中间两值平均；P1a 只校验版本和 `Q1 <= median <= Q3`。
9. Behavior 至少有 4 个完整周和 6 条合格 workout 才能 active；Baseline 至少覆盖 4 周和 6 个样本才可 active。未达门槛只能 candidate 且置信为 insufficient/low；terminal 项可保留历史 claim 与撤回证据。
10. `personalModelDecisionInputSchema` 只接受 `active`。`candidate`、`disputed`、`superseded` 与 `invalidated` 全部失败关闭；disputed 还必须有 disagreed feedback 与 `user_disputed` 限制。
11. Unknown 使用独立 `personal-model-unknown-v1` 收据，保存主题、原因、策略、窗口和评估时刻，不携带伪造的零样本统计。
12. `PersonalModelFeedbackEvent` 绑定 `userId + itemId + itemRevision`，固定四种选择、受限原因、最多 300 字敏感备注和 temporary 有效期。严格 Schema 拒绝 `confidenceDelta` 等客户端置信或状态提权字段。
13. P1a 不声称实现不可变模型 revision、no-op 指纹结果、反馈状态转换命令、Weekly Cognitive Review、持久化、权限、导出/删除传播或用户界面；这些仍是 P1b/P2 退出条件。

## 影响

- 首批条目的来源权限和统计语义可由 contracts、后续 repository 与客户端共同引用，避免数据库先产生任意画像结构。
- Goal/Constraint 不会被 Behavior 联合替换，Pattern/Hypothesis 和因果字段在第一阶段没有传输资格。
- Unknown、candidate、disputed 与 active 在机器边界上分开，后续 Contextual Decision 不能只依赖 UI 文案过滤。
- 当前单个 EvidenceSet 最大 800 条完整引用，只适合内部领域/测试边界；开放 API 前必须设计有界列表或分页，不能把该上限冒充生产负载证明。
- R-033 的一部分结构风险被自动门禁覆盖，但真实纵向阈值、来源删除传播、用户理解和长期标签伤害仍未证明，风险保持高等级开放。
- 面向用户的文案不得照搬内部类型名。页面必须把“本人确认”“系统按记录观察”“证据不足”“用户不同意”和“当前不用于建议”用清晰中文并列说明，避免严格技术结构反而制造不可质疑的权威感。
- 这些契约验证的是数据结构与关系，不验证某个训练安排是否合理、某项行为是否良好，也不判断用户是否自律。任何道德评价、健康正常范围或处方含义都不在本决策授权范围内。

## 备选方案

### 一个通用 `claim: Record<string, unknown>`

拒绝。它无法把类型、主题、来源和统计关系绑定，数据库或 LLM 可以写入契约未审阅的结论。

### 现在就开放八类 item

拒绝。Goal/Preference、Pattern/Hypothesis 需要不同权威与验证门槛；没有真实场景和测试时开放空分支只会扩大错误表达面。

### 用零值 Behavior 表示 Unknown

拒绝。零可能表示完整窗口中“没有记录”，也可能表示根本没有证据；独立 Unknown 收据保留这个差异。

### 让客户端直接提交 confidence 或 status

拒绝。置信和生命周期属于确定性服务端规则；反馈只能追加用户观点，不能成为提权命令。

### 在同一轮实现 revision、review、数据库和 API

拒绝。范围过大，无法分别证明对象不变量、状态转换、所有者隔离和读取权限。P1a/P1b/P2 依序完成。

## 验证

- 目标测试必须接受三个合法分支，并拒绝类型/主题/来源错配、Pattern/Hypothesis、因果额外字段和来源 revision 漂移。
- 逐周频率、时长区间、观察周、证据计数、owner、唯一性、撤回和置信关系必须失败关闭。
- candidate/disputed 决策输入、全零 item、非法 temporary 反馈、超长备注和 `confidenceDelta` 必须被拒绝。
- contracts 目标测试/类型、完整单元/集成、strict typecheck、构建、审计、文档与 Obsidian 门禁全部通过后才能提交。

## 关联

- [ADR-0175：有证据、可校准、可修订的个人认知模型](0175-evidence-backed-revisable-personal-model.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [已实现产品需求文档](../../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 182 轮档案](../../iterations/182-personal-model-core-contract.md)
