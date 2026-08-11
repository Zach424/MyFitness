# ADR-0180：Personal Model 证据投影内核

日期：2026-08-12

状态：已采纳

## 背景

ADR-0178 已把 Personal Model 完整 revision 快照保存到 PostgreSQL，其中 `evidence.references` 仍只是嵌套 JSON。只保存快照可以保真，却不能高效按来源查询受影响修订，也无法在数据库层证明快照引用与未来关系读取结果始终一致。如果独立关系表由应用分步写入，事务失败、漏写、换序或原始 SQL 旁路都可能让详情页、撤回传播和导出看到与历史快照不同的证据。

来源权威还有一个不能掩盖的缺口：`workout_revisions` 已保存不可变训练历史，但建档 `user_goals` 只有可变现态，没有可供 `onboarding_goal_revision` 引用的不可变目标修订表。因此本轮只能建立 revision 快照的精确关系投影，不能伪造多态来源外键，也不能宣称来源真实性、当前资格或撤回传播已经完成。

本轮只实现 P2c 第一段证据投影内核。不开放 API、OpenAPI、导出、派生器、Weekly Cognitive Review 或客户端。

## 决策

1. 新增 `personal_model_evidence_refs`，每行保存 owner、item、模型 revision、从 1 开始的 ordinal、reference ID、证据类型、来源聚合 ID/revision、作用角色、来源类型、资格、撤回原因和完整 `reference` JSON。
2. 投影通过 `(user_id,item_id,model_revision)` 复合外键绑定不可变模型修订并在账户删除时级联；同一修订内 ordinal、reference ID 和来源 kind/aggregate/revision 分别唯一，阻止换序、重复身份和同一来源多次计数。
3. CHECK 约束要求 JSON 拥有全部必要键，并与结构列的 owner、ID、类型、来源、角色、资格和撤回原因逐项相同。`onboarding_goal_revision` 只能是 `user_confirmed`，`workout_revision` 只能是 `manual` 或 `imported`；eligible 不得有撤回原因，withdrawn 必须有原因且只能作为 context；instant/interval 时间形状必须符合共享契约。
4. migration 先用 `jsonb_array_elements(... WITH ORDINALITY)` 从所有既有 revision 快照回填投影。任何旧快照不满足 1–800 条、身份、枚举、计数或 JSON 形状都会让迁移整体失败，不静默跳过历史。
5. 每次 `create()`、普通 `append()` 或 `applyFeedback()` 产生 revision 时，repository 都在同一事务中从已通过共享 Schema 的快照一次性插入全部证据行。revision、投影和 current 指针共同提交或共同回滚。
6. revision INSERT 与 evidence INSERT 两侧都安装延迟约束触发器。事务结束时数据库按 ordinal 重新聚合完整 `reference` JSON，并精确核对 revision 快照数组、总数以及 included/supporting/contradicting/withdrawn 四类计数；少写、多写、换序或迟到旁路行都不能提交。
7. evidence 投影行不可 UPDATE 或直接 DELETE。只有删除 owner 触发的级联可以清理完整 item/revision/feedback/evidence 历史；来源后续失效不得改写旧投影，而应产生新的 withdrawn 证据和模型 revision。
8. 本表明确是 revision 快照的查询投影，不是原始来源权威。当前不对 `source_aggregate_id/source_revision` 建立多态外键，也不通过存在于投影表中的值推断来源真实、未更正或仍有资格。
9. 下一步先为建档目标建立不可变历史，再分别绑定 onboarding goal/workout 来源资格和更正/删除事件。只有来源级关系与事务完成后，才能实现 withdrawn 传播与模型重算。

## 影响

- 模型修订的证据可以按 owner、item、revision 或来源聚合查询，同时仍以不可变完整快照为权威表示。
- repository 所有发布路径都必须写入投影；遗漏代码路径会被事务结束门禁拒绝，而不是留下部分历史。
- 原始 SQL 无法通过补写、换序、改写或删除关系改变某次历史修订的证据解释。
- 账户擦除继续清理全部 Personal Model 历史，没有因新增循环关系而阻塞 owner 级删除。
- P2c 降低了快照与查询投影漂移风险，但 R-033 仍为高风险：来源真实性、撤回传播、纵向阈值、内容正确性与真实用户理解尚未证明。
- 建档目标缺少不可变历史成为下一条明确的关键路径；在补齐前，任何 `onboarding_goal_revision` 只表示快照声明，不能作为可验证来源引用。

## 备选方案

### 继续只查询 revision JSON

拒绝。它保留历史，但来源影响查询、证据分页和撤回候选定位都需要反复扫描嵌套 JSON，且无法提供关系读取与快照一致的数据库证明。

### 由 repository 写关系，不设双向延迟门禁

拒绝。应用异常、未来新写入路径或原始 SQL 都可能漏投影；单向外键只证明关系属于 revision，不能证明 revision 的全部证据都已投影且顺序、计数完全相同。

### 现在就给两个来源类型建立外键

拒绝。训练修订具备不可变历史，建档目标却没有同等来源表。只绑定其中一种会造成不对称语义，把 `onboarding_goal_revision` 绑定到可变现态则会伪造历史权威。

### 来源删除时直接删除旧 evidence 行

拒绝。它会改变历史 revision 的解释并破坏指纹审计。来源资格变化应保留旧快照，在新 revision 中追加 withdrawn 引用和更新后的结论。

### 同轮实现来源历史、撤回传播和公开读取

拒绝。本轮先隔离并验证投影原子性；来源生命周期、重算政策、授权、分页、导出和用户文案各自需要独立验收。

## 验证

- 静态 schema drift 必须锁定 evidence 枚举、结构列、复合外键、三类唯一性、JSON/来源/资格/时间约束、回填、双侧延迟门禁和不可变触发器。
- 真实 PostgreSQL 必须证明初始修订按原顺序得到精确 JSON 投影，直接 UPDATE/DELETE、迟到补行和快照不一致都失败关闭。
- create、append 与反馈 revised 都必须沿同一个 revision 写入方法获得原子投影；no-op 不产生 revision，也不产生伪证据历史。
- 账户删除前每个 revision 必须存在完整 evidence 投影，删除后 item/revision/feedback/evidence 四张表全部归零。
- migration 必须完整回填既有 revision；任何失败都由 PostgreSQL 事务回滚，迁移账本不得提前记录 0039。
- strict typecheck、完整单元/集成、构建、生产依赖审计、双端客户端质量、中文文档、迁移清单、Obsidian 和 Git 差异门禁全部通过后才能提交。

## 关联

- [ADR-0178：Personal Model item/revision 最小持久内核](0178-personal-model-item-revision-persistence-core.md)
- [ADR-0179：Personal Model 反馈事件与结果事务](0179-personal-model-feedback-event-transaction.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 186 轮档案](../../iterations/186-personal-model-evidence-projection-core.md)
