# ADR-0158：便携归档训练动作同根分层生命周期

日期：2026-08-11

状态：已采纳

## 背景

第 163 轮已经用 owner-scoped `(started_at,created_at,id)` keyset 建立覆盖软删除 workout 的有界会话头源，但该独立 session 在头部物理 EOF 后就会提交。若动作另开事务，同一次导出可能把 workout 头和 exercise 读成不同事实时刻；若先把全部动作聚合进头 payload，合法 30×50 训练图又会越过 64 KiB 单元素门禁。

第 162 轮的递归懒 JSON 来源已经定义深层数组的按需读取与取消传播，因此下一项关键路径不是公开 v4 连接，而是把数据库外层游标、单 workout 动作子流和根提交责任绑定到同一个生命周期。该边界必须拒绝调用方跳过、重复或提前停止子流，否则事务可能提交一棵不完整但外形合法的用户证据树。

## 决策

1. 新增内部 `createWorkoutExerciseLayerSnapshot()`。它只建立一次 active owner 校验和只读 `REPEATABLE READ` 流事务，在同一 client 上先按全历史三元组读取 workout 头，再为当前头提供一次性 exercise 子流。
2. workout 头继续只含第 163 轮的 15 个标量并覆盖软删除会话。动作只投影 `id,position,exercise_key,name,category,notes,tracking_mode,equipment,equipment_notes` 九个标量，不包含 sets。
3. 动作按父级唯一 `position` 升序分页。应用只保留末动作 UUID；下一页锚点子查询同时限定 owner、workout 与动作 UUID，再从同一快照恢复 position。
4. 动作查询通过 `workout_exercises` 与 `workout_sessions` 的 join 绑定认证 owner，不能只相信调用方提供的 workout UUID。
5. 每页继续使用默认 25/最大 100 行和 64 KiB PostgreSQL UTF-8 payload 门禁；头与动作分别累计批次/行数并只在根成功完成后发布统一收据。
6. 每个 workout 的 exercise 子流必须恰好启动一次且到达物理 EOF，外层才允许请求下一个 workout。跳过、重复或提前 `return()` 都失败关闭整个根事务。
7. 外层到达私有 boundary 不等于成功；调用方必须显式执行 `complete()`，由它把数据库生成器推进到物理 EOF并提交。未完成时调用 `complete()` 必须失败关闭。
8. `cancel(error)` 必须先关闭当前活动 exercise 迭代器，再关闭根事务迭代器；收据保留原始错误对象。若清理也失败，用有序 `AggregateError` 同时保留根因与清理失败。
9. 复用既有 `UNIQUE (workout_id,position)` 索引，不增加迁移。真实 PostgreSQL 必须对生产实际动作分页 SQL 执行计划验证，而不只检查约束存在。
10. 本轮不把该来源接入公开 v4 或三集合协调器，不实现 sets/history，不改变同步下载，也不增加路由、KMS、执行器、授权或客户端入口。

## 影响

- workout 头和动作头第一次共享同一个所有者快照，消除了父子跨事务裂缝。
- 调用方不能以空动作数组或未完全读取的动作子流推进外层，减少不完整用户证据被提交的风险。
- 根事务会在消费者读取每个动作子流期间保持打开；未来执行器必须有租约、超时和主动取消，不能把该内部 session 暴露给不受控客户端。
- 既有唯一位置约束同时承担确定顺序和 keyset 索引，不需要增加写放大。
- 本层仍没有 sets 与修订，且未连接 v4；同步导出内存没有下降，R-013 保持开放。

## 备选方案

### 每个 workout 单独打开动作事务

拒绝。父头和动作可能来自不同快照，并发更正会形成从未真实存在过的组合。

### 在外层提前聚合全部动作

拒绝。它恢复父级内存聚合，也不能为下一层 sets 提供背压。

### 允许未读取动作并把它解释为空数组

拒绝。“尚未消费”不是“用户没有动作”；公开或归档不完整事实会破坏可携带性。

### 子流提前停止时只关闭子流，继续其他 workout

拒绝。完成收据将无法证明整棵训练层都来自同一完整遍历。

### 为动作增加新的导出索引

拒绝。既有非部分唯一 `(workout_id,position)` 已与查询顺序一致；实际计划证明足够时不应增加重复写成本。

### 立即把 workout→exercise 接到公开 v4

拒绝。缺少 sets/history 的对象仍不完整，会把结构进展误报成用户可用导出。

## 验证

- 目标数据库快照单元测试必须为 16/16 项通过；真实 PostgreSQL 文件必须为 17/17 项通过。
- 两个 owner workout 必须按头部总序输出，软删除头仍保留；各动作按 position 输出，其他 owner 不可见。
- 打开根快照后向当前和后续 workout 新增的动作都不得进入该 session。
- 每个动作必须恰好包含九个允许字段并明确不含 sets。
- 实际动作分页 SQL 的计划 JSON 必须包含 `workout_exercises_workout_id_position_key`。
- 外层结束后收据必须保持未结算，直到显式 `complete()`；成功收据分别对账 workout 头和动作的批次/行数。
- 跳过、重复和提前停止动作子流必须拒绝同一根收据；主动取消时活动子流先关闭，收据保留原始取消对象。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [ADR-0156：便携归档递归懒 JSON 来源契约](0156-portable-export-recursive-lazy-json-source.md)
- [ADR-0157：便携归档训练全历史会话头游标](0157-portable-export-workout-header-keyset.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 164 轮档案](../../iterations/164-portable-export-workout-exercise-layer-lifecycle.md)
