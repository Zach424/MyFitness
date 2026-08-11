# ADR-0160：便携归档训练修订头同根顺序生命周期

日期：2026-08-11

状态：已采纳

## 背景

第 165 轮已把 workout、exercise 与 set 当前关系图放入同一个 owner-scoped `REPEATABLE READ` 根事务，但同步导出中的 `history` 仍来自 `workout_revisions`。如果修订另开事务，当前关系图和历史可能来自不同事实时刻；如果立即交付完整 `snapshot`，单条不可变全图仍可能超过 64 KiB 数据库→Node 门禁。

修订表已有非部分 `UNIQUE (workout_id,revision)` 与 `(user_id,workout_id,revision desc)` 索引。当前最小关键路径是先建立有界 revision 头层和严格兄弟字段顺序，证明所有权、并发隔离、索引与取消责任；完整 snapshot 保持必需但延后递归分解。

## 决策

1. 新增内部 `createWorkoutRevisionHeaderLayerSnapshot()`，保留第 165 轮三层方法以便比较与回退。新方法只建立一次 active owner 校验和一个只读 `REPEATABLE READ` 流事务。
2. 每个 workout 先暴露当前关系图 `exercises`，其中 exercise 和 set 继续按父级唯一 `position` 读取；只有关系图完整到达物理 EOF 后，`history` 才能启动。
3. revision 头只投影 `id,action,revision,changed_at`，明确排除 `snapshot`、`workout_id` 与 `user_id`。排除不是丢弃历史，而是隔离下一轮必须解决的大对象递归边界。
4. revision 查询通过 `workout_revisions → workout_sessions` 同时验证父 workout owner 与冗余 revision owner，并限定精确 workout；不能只相信子级 UUID 或冗余 owner 列。
5. revision 按父级唯一 `revision` 升序分页。应用只保存末 revision UUID；锚点子查询在同 owner/workout 范围内恢复完整 revision。
6. 四层继续复用默认 25/最大 100 行和 64 KiB PostgreSQL UTF-8 payload 门禁；成功收据分别发布 workout 头、exercise 头、set 与 revision 头的批次/行数。
7. exercises 必须先于 history 且两者均只能启动一次并完整结束。乱序、跳过、重复消费或提前 `return()` 都失败关闭整个根事务，不能把未读取 history 解释为空历史。
8. 外层到达私有 boundary 后仍需显式 `complete()` 推进数据库生成器物理 EOF。根取消关闭活动 set、exercise 或 history 后再关闭 transaction；清理错误有序聚合且不掩盖根因。
9. 复用既有两个 revision 索引，不增加迁移；真实 PostgreSQL 对生产实际 revision 页 SQL 执行计划验证。
10. 本轮不解析或截断 `snapshot`，不连接公开 v4 或三集合协调器，不改变同步下载，也不增加路由、KMS、执行器、授权或客户端入口。

## 影响

- 当前关系图和修订身份第一次共享一个 owner、快照、提交与取消责任。
- history 在关系图之前启动会直接失败，数据库会话顺序与既有 v4 workout 字段顺序一致。
- 四段收据能区分关系图和修订头是否完整遍历，不会用合计数掩盖缺失 history。
- 根事务会跨越更深的嵌套消费者，未来租约执行器必须限制持有时间并支持主动取消。
- 完整 snapshot 仍未有界化，同步导出内存没有下降，R-013 保持开放。

## 备选方案

### 把完整 revision snapshot 作为一个 payload

拒绝。合法 snapshot 可以超过 64 KiB；提高门禁会恢复大对象交付，截断则破坏不可变证据。

### revision history 单独打开事务

拒绝。当前关系图和修订头可能来自不同快照，并发追加会形成无法解释的事实组合。

### history 可以先于 exercises 读取

拒绝。最终 JSON 字段顺序固定，乱序读取还允许两个活动数据库来源争用同一 client。

### 未消费 history 时继续下一个 workout

拒绝。“未读取”不能解释为“没有修订”；完成收据会失去完整性含义。

### 只校验 `workout_revisions.user_id`

拒绝。冗余列不是父级所有权证明；生产查询必须同时约束父 workout owner、revision owner 和 workout ID。

### 为升序 revision 分页增加新索引

拒绝。既有降序复合索引可反向扫描，父级唯一索引也覆盖总序；实际计划可用时不增加写放大。

## 验证

- 目标数据库快照单元测试必须为 29/29 项通过；真实 PostgreSQL 文件必须为 23/23 项通过。
- 软删除 owner workout 必须按 workout→exercise→set→revision header 输出，其他 owner 不可见；revision 恰好包含四个允许字段。
- 打开根快照后追加的 revision 不得进入该 session，下一次新 session 才可见。
- 实际 revision 页 SQL 的计划 JSON 必须使用既有 revision 索引之一。
- 关系图之前读取 history、跳过 history、history 早停或重复读取必须拒绝同一根收据。
- 活动 set 与活动 history 两条取消路径都必须先关闭当前最深来源，再关闭 workout 根。
- 四层结束后 receipt 必须保持未结算，直到显式 `complete()`；成功收据分别对账四层。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [ADR-0159：便携归档训练组三层同根生命周期](0159-portable-export-workout-set-layer-lifecycle.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 166 轮档案](../../iterations/166-portable-export-workout-revision-header-lifecycle.md)
