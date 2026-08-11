# ADR-0157：便携归档训练全历史会话头游标

日期：2026-08-11

状态：已采纳

## 背景

第 161 轮证明，一个被现有创建契约接受的 30×50 workout 当前关系图即使排除 history 也会超过简单行源的 64 KiB 门禁；第 162 轮已经让 v4 JSON 来源类型能够表达 exercises、sets 和 history 的递归懒数组。下一项缺口是数据库外层游标：如果仍先聚合整个 workout，递归编码能力无法形成数据库背压；如果只读取活动会话，又会遗漏软删除与更正证据。

现有活动列表索引为 `(user_id,started_at DESC,created_at DESC,id DESC) WHERE deleted_at IS NULL`。它的谓词刻意排除软删除记录，不能承担用户便携导出的全历史扫描。索引应当与实际 keyset 查询一起交付，并证明排序、owner 隔离、快照边界与取消，而不是先写一个未使用的索引。

## 决策

1. 新增内部 `createWorkoutHeaderSnapshot()`，复用既有只读 `REPEATABLE READ` 会话、active owner 校验、默认 25/最大 100 行批次、64 KiB PostgreSQL UTF-8 payload 门禁和完成/取消收据。
2. 会话头按 `(started_at,created_at,id)` 升序分页。应用只保留末 UUID，下一页由同一快照中的 owner-scoped 锚点子查询恢复完整三元组，避免 JavaScript 时间精度损失。
3. 查询覆盖活动与软删除的 `workout_sessions`，只投影 `id,title,status,source_kind,source_metadata,started_at,ended_at,timezone,pain_level,fatigue,note,revision,deleted_at,created_at,updated_at`。
4. payload 不包含 `user_id`、`idempotency_key`、`request_hash`、exercises、sets 或 history。缺少嵌套数据是内部头部语义，不得用空数组冒充完整公开 workout。
5. 迁移 0032 新增非部分索引 `workout_sessions (user_id,started_at,created_at,id)`；活动列表的原部分降序索引保持不变，各自服务不同读取边界。
6. 真实 PostgreSQL 必须以反向插入覆盖 started_at、created_at 和 UUID 三层排序，证明其他 owner 不可见、软删除保留，并发新增不会进入已打开快照。
7. 索引验证同时读取 PostgreSQL 目录，证明新索引无谓词且列顺序精确；对生产实际分页 SQL 执行 `EXPLAIN (FORMAT JSON)`，测试用 `SET LOCAL enable_seqscan = off` 消除微型夹具成本选择，要求计划树包含新索引。
8. AbortSignal 在首行后触发时，第二行不得暴露，行流与完成收据必须拒绝同一错误对象。
9. 本轮不把头源加入 `createConsentHealthSnapshot()`，不改变同步导出，不增加公开路由、KMS、执行器、授权或客户端入口。

## 影响

- workout 分层迁移第一次有了包含软删除证据的有界数据库外层游标，且不会把 owner 保管字段或幂等秘密带入 payload。
- 查询顺序与同步 v4 顶层顺序一致；同时间记录由 UUID 形成确定总序。
- 非部分索引增加 workout 写入与存储成本，但避免把活动列表索引错误解释为全历史导出能力。
- `enable_seqscan=off` 计划测试证明实际 SQL 与索引结构兼容，不代表生产优化器在任意数据分布下必然选择同一计划；生产容量仍需独立观测。
- 独立头源在物理 EOF 后提交。未来嵌套组装器需要在每个头部的 exercises/sets/history 消费期间继续保管同一根事务，不能直接把当前不完整头对象发布进 v4。
- 同步 workout 仍完整聚合，R-013 保持开放。

## 备选方案

### 复用活动列表部分索引

拒绝。它排除 `deleted_at IS NOT NULL` 的会话，会静默丢失用户修订与删除证据。

### 把完整 workout 作为头部 payload

拒绝。合法 30×50 当前图已经超过 64 KiB，历史又没有数量上限。

### 在头部中填入空 exercises/history 并立即接入 v4

拒绝。格式看似合法但内容不完整，会把缺失证据伪装成用户没有动作或历史。

### 只验证索引定义，不执行查询计划

拒绝。目录列顺序不能证明实际 SQL 形状可以消费索引；两类证据需要同时存在。

### 大量插入夹具以诱导自然索引计划

暂缓。微型集成库的成本选择不稳定且会放大测试时间；本轮用事务局部禁用顺序扫描证明索引可用性，并明确不把它表述为生产成本结论。

## 验证

- 目标数据库快照单元测试必须为 12/12 项通过；真实 PostgreSQL 文件必须为 14/14 项通过。
- 反向插入的四个 owner workout 必须按 started_at、created_at、UUID 顺序跨两页输出，其中一条软删除记录保留；其他 owner 与打开后新增记录不得出现。
- 每个头部必须恰好包含 15 个允许字段，并明确没有 exercises/history。
- 迁移索引必须无谓词、列顺序精确，同一分页 SQL 的计划 JSON 必须包含 `workout_sessions_user_export_idx`。
- 首行后的取消必须让行流与收据共享同一取消错误，不能暴露第二行。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [ADR-0156：便携归档递归懒 JSON 来源契约](0156-portable-export-recursive-lazy-json-source.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 163 轮档案](../../iterations/163-portable-export-workout-header-keyset.md)
