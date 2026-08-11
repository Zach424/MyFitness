# 第 186 轮：Personal Model P2c 证据投影内核

日期：2026-08-12

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只实现 Personal Model P2c 第一段：把每个完整 revision 快照中的有序 `evidence.references` 原子投影到不可变 `personal_model_evidence_refs`，并由数据库在事务结束时证明 owner、item、revision、顺序、完整引用 JSON 和计数与快照完全一致。create、普通 append 和反馈 revised 必须共用同一写入路径，账户删除仍须清理全部历史。

审阅发现 `workout_revisions` 已有不可变来源历史，但建档 `user_goals` 只有可变现态。因此本轮明确不实现来源外键、来源真实性判断或更正/删除撤回传播；不得把快照投影冒充来源权威。本轮也不实现 Weekly Cognitive Review、公开 API、OpenAPI、导出、派生器或客户端。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0039_personal_model_evidence_projection_core.sql`
  - 新增 owner/item/model revision、ordinal、来源身份、角色、资格、撤回原因和完整 JSON 的证据投影表。
  - 复合 revision 外键、三类唯一性和 JSON/结构列一致性约束阻止跨 owner、重复身份、重复来源和表示漂移。
  - 来源类型、资格/撤回关系与 instant/interval 时间形状按 P1a 共享契约失败关闭。
  - 使用 `WITH ORDINALITY` 回填既有 revision；延迟双侧触发器重聚合引用并核对全部计数。
  - UPDATE/直接 DELETE 被不可变触发器拒绝，owner 级账户删除仍可级联。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - `insertEvidenceReferences()` 从已验证 revision 快照一次插入全部引用。
  - 该方法位于统一 `insertRevision()` 内，因此创建、普通追加和反馈产生的新修订都与投影同事务提交。
- `apps/api/src/personal-model/personal-model.repository.integration.spec.ts`
  - 从 11 项扩展为 12 项真实 PostgreSQL 测试，验证精确顺序/完整 JSON 投影、直接改写/删除和迟到补行失败。
  - 账户删除测试在删除前确认每个 revision 都有 evidence 行，删除后确认四张 Personal Model 表归零。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增迁移 0039 保真门禁，锁定 evidence 枚举、核心列、复合关系、唯一性、回填、双侧投影触发器和不可变语义。
- ADR-0180 与 Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. revision 完整快照仍是历史权威表示，关系表只是可索引、可分页和可定位来源影响的精确投影，不改变指纹覆盖内容。
2. 关系行既保存常用结构列，也保存完整 `reference` JSON；CHECK 逐项验证两种表示一致，读取效率不能以牺牲保真为代价。
3. 一次 JSON 数组展开插入保留原始 ordinal。每个模型 revision 内 ordinal、reference ID 和来源 kind/aggregate/revision 均唯一。
4. 单有 repository 事务不足以覆盖未来代码和原始 SQL，因此 revision INSERT 与 evidence INSERT 两侧都安装可延迟约束触发器，提交前重新聚合并比较完整数组与全部计数。
5. 延迟门禁允许先插 revision、后插关系，同时确保事务不能停在中间状态；create、append 和 feedback revised 都通过统一 `insertRevision()` 自动获得该保证。
6. 迁移用同一映射规则回填历史，旧快照若不符合当前共享边界会整体回滚，而不是产生部分投影。
7. 历史关系只能追加。来源未来失效不能 UPDATE/DELETE 旧行，而应在补齐来源历史后产生新 withdrawn 证据和新模型 revision。
8. 本轮不对 `source_aggregate_id/source_revision` 建立多态外键，因为建档目标没有不可变来源修订。用明确缺口换取真实语义，避免技术完整外观掩盖来源不可验证。

## 4. 验证证据

- 迁移 0039 在本地 PostgreSQL 成功应用，`schema_migrations` 连续至 0039；第一次因匿名列 CHECK 与显式跨字段约束同名而失败时，事务完整回滚且迁移账本未写入 0039。
- schema drift 目标测试 27/27 通过；Personal Model 仓储真实 PostgreSQL 集成测试 12/12 通过；API strict typecheck 通过。
- 完整单元测试 102 个文件、596/596 项通过；完整集成测试 24 个文件、142/142 项通过；既有浏览器测试基线仍为 95 项。
- 全仓 strict typecheck、生产构建和生产依赖审计通过，依赖保持 0 个 critical/high、9 个已登记 moderate。
- 客户端质量门禁通过：H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均在既有预算内且无禁用标记。
- 中文、迁移清单、十份变更文档相对链接、Prettier 和 `git diff --check` 门禁通过；`docs/` 为 396 份 Markdown，待迁移总量保持 191，第 090–186 轮与 ADR-0085–0180 连续受保护。
- 最终数据库为迁移 0039，目标测试清理后 item/revision/feedback/evidence 四张表均为 0 行；Obsidian 权威状态镜像同步并独立校验通过：71,517 bytes，SHA-256 `cd8f565e33f75385e367d4afed39834e4251af6966479a0d06326d004579ef47`。

## 5. 发现的问题与经验

- 第一版迁移同时使用匿名列 CHECK 和同名显式跨字段 CHECK，PostgreSQL 会为匿名约束生成名称并在同一表内碰撞。迁移事务完整回滚，证明迁移执行器没有提前写账本；显式约束改用 `source_compatibility` 与 `qualification_relation` 命名后成功应用。
- evidence JSON 留在 revision 中并不等于已经有安全的关系读取。只有两侧延迟检查同时证明“每个快照引用都有关系”和“每个关系都属于快照”，才能阻止少写与多写两种漂移。
- 只核对行数不足以保真；换序、重复来源、结构列与 JSON 不一致都可能改变展示和计数，因此提交门禁必须重聚合完整有序 JSON，并独立核对四类计数。
- `personal_model_evidence_refs` 可以回答“某个快照声明引用了什么”，不能回答“原来源当时真实存在且现在仍合格”。投影、来源权威和当前资格是三个不同问题。
- 训练记录已有不可变修订，不代表建档目标也有。为两种 evidence kind 设计来源外键前必须逐个审计实际来源生命周期，不能仅凭契约名称假定 revision 表存在。
- 历史证据的纠正方式是追加 withdrawn 关系和新模型 revision，不是删除旧关系。不可变历史与用户纠错并不冲突，前提是当前资格和历史事实分别建模。

## 6. 全局状态、项目反思与下一步

P2c 第一段完成后，Personal Model 的每次 revision 已具备可查询、不可变且与快照精确一致的证据关系，未来证据分页、导出和来源影响定位不再需要扫描全部嵌套 JSON。这一步也把来源权威缺口暴露得更清楚：当前建档目标没有不可变修订历史，不能支撑 `onboarding_goal_revision` 的真实外键或撤回传播。因此项目继续是内部 Alpha，用户仍看不到认知镜子，系统也不能宣称证据当前有效。

下一轮先补齐建档目标不可变历史和写入兼容迁移，再绑定 onboarding goal/workout 来源资格；之后实现来源更正/删除如何追加 withdrawn 证据、产生模型新修订并保持旧快照不变。Weekly Cognitive Review、API、客户端和 LLM 表达层继续拆轮。

## 7. 参考

- [第 185 轮档案](185-personal-model-feedback-event-transaction.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0180](../architecture/decisions/0180-personal-model-evidence-projection-core.md)
