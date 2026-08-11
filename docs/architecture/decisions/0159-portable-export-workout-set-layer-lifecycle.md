# ADR-0159：便携归档训练组三层同根生命周期

日期：2026-08-11

状态：已采纳

## 背景

第 164 轮已经让全历史 workout 头和一次性 exercise 子流共享同一个 owner-scoped `REPEATABLE READ` 根事务，但动作仍只有标量头。如果 sets 另开事务，当前动作和训练组可能来自不同事实时刻；如果在动作页中聚合全部 sets，最大 30×50 的合法当前关系图又会恢复大对象交付，并阻断最深层背压。

数据库已有 `UNIQUE (exercise_id,position)`，与同步导出的组顺序一致。下一项最小关键路径是复用该索引，把 set 作为第三层一次性子流，并把跳过、重复、提前停止与取消责任从 exercise 继续传到最深活动 set。公开 v4 仍不能在 history 缺失时连接。

## 决策

1. 新增内部 `createWorkoutSetLayerSnapshot()`，保留第 164 轮双层方法以便比较与回退。新方法只建立一次 active owner 校验和只读 `REPEATABLE READ` 流事务。
2. workout 头继续按 `(started_at,created_at,id)` 覆盖活动与软删除会话；exercise 继续按父级 `position` 输出九个标量。
3. 每个 exercise 新增一次性 set 子流，只投影 `id,position,kind,reps,display_load,display_load_unit,canonical_load_kg,duration_seconds,distance_meters,rpe,completed` 十一个标量，不携带 `exercise_id`。
4. set 查询通过 `workout_sets → workout_exercises → workout_sessions` join 同时限定认证 owner、精确 workout 和精确 exercise，不能只相信调用方提供的子级 UUID。
5. set 按父级唯一 `position` 升序分页。应用只保存末 set UUID；锚点子查询在同 owner/workout/exercise 范围内恢复完整 position。
6. 三层继续复用默认 25/最大 100 行和 64 KiB PostgreSQL UTF-8 payload 门禁，并在根成功后分别发布 workout 头、exercise 头和 set 的批次/行数。
7. workout、exercise 与 set 子流都必须恰好启动一次并到达各自物理 EOF，父层才允许前进。未启动、重复消费或提前 `return()` 都失败关闭整个根事务。
8. 外层到达私有 boundary 后仍需显式 `complete()` 推进数据库生成器物理 EOF。根取消依次关闭活动 set、exercise 和 transaction；清理失败用有序 `AggregateError` 保留，不能掩盖根因。
9. 复用既有 `workout_sets_exercise_id_position_key`，不增加迁移；真实 PostgreSQL 对生产实际 set 页 SQL 执行计划验证。
10. 本轮不实现 workout revision/history，不连接公开 v4 或三集合协调器，不改变同步下载，也不增加路由、KMS、执行器、授权或客户端入口。

## 影响

- 当前 workout 关系图的头、动作与组第一次共享一个 owner、快照、提交和取消责任。
- 最深层 set 可以独立产生背压；调用方不能把未遍历的组伪装成空数组并继续其他动作。
- 新三段收据能区分父头、动作与组是否全部遍历，避免单一合计数掩盖缺层。
- 根事务会在三层消费者之间保持打开，未来租约执行器仍需限制持有时间并支持主动取消。
- history 仍未有界化，当前同步导出仍完整聚合，R-013 保持开放。

## 备选方案

### 在 exercise 页中聚合全部 sets

拒绝。它恢复大父对象分配，也无法在单个 set 边界背压或精确取消。

### 每个 exercise 单独打开 set 事务

拒绝。父动作和组可能来自不同快照，并发更正会形成从未真实存在的组合。

### 未消费 set 时继续下一个 exercise

拒绝。“未读取”不能解释为“没有组”；完成收据将失去完整性含义。

### set 早停只关闭当前 set 来源

拒绝。若根事务继续提交，归档会合法化不完整关系图。早停必须沿 exercise/workout 向根传播。

### 为 set 新增重复导出索引

拒绝。既有非部分唯一 `(exercise_id,position)` 与分页顺序一致，实际计划证明可用后不应增加写放大。

### 当前关系图完成后立即接入公开 v4

拒绝。每个 workout 的不可变 history 仍缺失，空 history 会误报用户没有修订证据。

## 验证

- 目标数据库快照单元测试必须为 22/22 项通过；真实 PostgreSQL 文件必须为 20/20 项通过。
- 软删除 owner workout 必须按 workout→exercise→set 输出，其他 owner 不可见；set 按 position 总序且恰好包含十一个允许字段。
- 打开根快照后向当前与后续 exercise 新增的 set 均不得进入该 session。
- 实际 set 页 SQL 的计划 JSON 必须包含 `workout_sets_exercise_id_position_key`。
- 三层结束后 receipt 必须保持未结算，直到显式 `complete()`；成功收据分别对账头、动作与组。
- 跳过 exercise、跳过 set、set 早停和重复 set 必须拒绝同一根收据；主动取消时 set 先关闭，再关闭 exercise 与 workout 根。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [ADR-0156：便携归档递归懒 JSON 来源契约](0156-portable-export-recursive-lazy-json-source.md)
- [ADR-0158：便携归档训练动作同根分层生命周期](0158-portable-export-workout-exercise-layer-lifecycle.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 165 轮档案](../../iterations/165-portable-export-workout-set-layer-lifecycle.md)
