# ADR-0182：Personal Model 来源资格与撤回刷新协议

日期：2026-08-12

状态：已采纳

## 背景

迁移 0039 已把 Personal Model revision 中的 evidence 引用投影成不可变关系，迁移 0040 又为 onboarding goal 建立了稳定聚合和不可变修订历史。但是投影中的通用字符串还不能由数据库证明一定命中同一 owner 的真实 goal/workout 修订，也不能区分“旧模型当时引用过”与“新模型现在仍可使用”。如果来源后来被更正或删除，直接改写旧 evidence 会篡改历史；只在应用中检查当前值又会留下旁路和并发窗口。

本轮只建立精确来源外键、当前资格门禁和不可变撤回刷新协议。它不决定更正后的新 claim、置信度或状态，不实现自动刷新执行器、公开 API、客户端界面、Weekly Cognitive Review 或模型导出。

## 决策

1. `personal_model_evidence_refs` 从既有严格 JSON 引用生成 nullable subtype 键：goal 引用生成 `onboarding_goal_id/revision`，workout 引用生成 `workout_id/revision`。非对应 subtype 的生成键必须为 null。
2. goal 和 workout 引用分别通过 owner + 稳定聚合 ID + 精确 revision 的复合外键命中 `user_goal_revisions` 与 `workout_revisions`。workout history 补充 owner + workout + revision 唯一键，避免只靠全局字符串关联。
3. 延迟来源资格门禁核对引用类型、来源时刻、时区和精确快照。eligible goal 必须是当前 goal revision；eligible workout 必须是当前且未删除的 workout revision。withdrawn 引用保留旧来源事实，并要求 reason 与来源更正或删除状态一致。
4. 当前资格只约束新写模型 revision，不反向改写旧 revision。历史模型继续表达当时发布的陈述；来源当前失效由独立刷新账本表达。
5. goal/workout 新修订写入时，在同一来源事务为所有仍把旧修订作为当前 eligible evidence 的 item 追加不可变 `personal_model_source_refresh_requests`。请求精确记录 owner、item、来源类型、旧/新 revision、原因和受影响模型 evidence，唯一键保证同一来源变化幂等。
6. 迁移对已失去当前资格但仍为 eligible 的既有引用回填请求，不伪造新的模型 revision，也不修改原 evidence。
7. item 下一次追加模型 revision 时，必须携带请求所指旧来源的 withdrawn context。仓储在同一事务追加 `personal_model_source_refresh_resolutions`，把请求、旧 evidence、新模型 revision 和新 withdrawn evidence 精确绑定。
8. 新模型 revision 的延迟门禁拒绝任何跨过未解决请求的提交；伪造 resolution、错 owner、错 item、错来源、错 revision 或错 withdrawn reason 都失败关闭。请求和解决记录均不可直接 UPDATE/DELETE，账户删除级联除外。
9. `training_availability_constraint_v1` 允许一个稳定 goal 聚合同时保留历史 withdrawn context，并要求非终态 item 恰好有一个当前 eligible goal 来源。claim 所指 revision 必须有对应引用；不同 goal 聚合不得混入同一条目。
10. 刷新账本只规定“必须处理哪次来源变化以及如何证明处理过”，不负责推导新 claim。下一轮由确定性 training availability 派生器消费请求，按严格 Schema 与安全规则生成最小修订。

## 影响

- goal/workout evidence 第一次由数据库证明属于同一 owner、稳定聚合与精确不可变修订，而不是只有格式正确的字符串。
- 更正和删除不会篡改历史模型；下一 revision 必须显式撤回旧 context，处理过程可追溯且不能静默跳过。
- 来源更新事务会增加少量请求扫描和不可变账本写入；后续需要用真实规模观测索引和锁等待，但当前保持模块化单体事务边界。
- 迁移检查点之前不存在的 goal revision 仍无法被引用，覆盖缺口不会因来源绑定而被洗掉。
- R-033 的来源所有权、精确版本和撤回传播风险得到结构性缓解，但刷新内容正确性、纵向阈值、专家审阅、公开授权、导出与用户理解仍未证明。

## 备选方案

### 继续只验证通用 evidence JSON

拒绝。格式正确不等于来源存在、属于本人或版本精确，原始 SQL 和未来应用路径仍可写入悬空引用。

### 为每种来源拆分独立 evidence 表

暂不采用。生成式 subtype 键能在保留统一有序投影的同时提供真实复合外键；来源类型扩大且查询压力被测量后再评估拆表。

### 来源更正时原地把旧 evidence 改为 withdrawn

拒绝。旧模型 revision 是已发布快照，改写会让审计、反馈和用户校准失去当时语义，也违反既有不可变门禁。

### 只给刷新请求增加可变 status

拒绝。可变状态无法证明由哪个新模型 revision 和哪条 withdrawn evidence 解决。独立不可变 resolution 能保留精确处理证据。

### 在来源触发器中直接生成新模型 claim

拒绝。数据库触发器不应承担产品推断、置信度或状态决策；这些结果必须经过共享 Schema、确定性安全校验和可测试派生器。

### 同轮开放 Personal Model API 与客户端

拒绝。当前只完成内部持久化权威和撤回协议；在派生器、授权、导出和用户可理解表达完成前开放读取会扩大未验证风险。

## 验证

- 静态 schema drift 必须锁定生成 subtype 键、两类复合来源外键、来源资格函数、请求/解决关系、写入触发器、延迟门禁和不可变语义。
- 真实 PostgreSQL 必须拒绝不存在、跨 owner、元数据不匹配和失去当前资格的 eligible 来源；精确 goal/workout 来源必须成功绑定。
- goal 更正、workout 更正和 workout 删除必须分别生成一次精确请求；遗漏撤回的新模型 revision 必须回滚，正确 withdrawn revision 必须生成精确 resolution。
- 请求/解决记录直接改写或删除必须失败；账户删除后 evidence、请求和解决记录必须全部为零。
- 共享契约必须接受同一 goal 聚合的历史 withdrawn + 当前 eligible 修订，并拒绝跨聚合混合。
- strict typecheck、完整测试/构建、依赖审计、双端质量、中文文档、Obsidian 和 Git 差异门禁全部通过后才能提交。

## 关联

- [ADR-0176：Personal Model 核心契约](0176-personal-model-core-contract.md)
- [ADR-0180：Personal Model 证据投影内核](0180-personal-model-evidence-projection-core.md)
- [ADR-0181：onboarding goal 不可变修订历史](0181-onboarding-goal-revision-history.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 188 轮档案](../../iterations/188-personal-model-source-qualification-refresh.md)
