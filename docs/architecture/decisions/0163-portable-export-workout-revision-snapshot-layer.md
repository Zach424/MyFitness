# ADR-0163：便携归档训练完整修订快照同根组合

日期：2026-08-11

状态：已采纳

## 背景

第 166 轮已经让 workout 当前关系图与 revision header 共享一个根事务，第 168 轮又独立证明单 revision snapshot 的根→exercise→set 原序递归来源。两条会话仍然分离：如果由调用方先运行 header 会话、再为每条 revision 打开单独事务，就会产生检查时刻与交付时刻裂缝，也会重复 active owner 校验和取消状态机；如果只保留 header，则会丢失同步 v4 必须包含的不可变 `snapshot`。

同步 v4 的修订元素是 PostgreSQL JSONB 解析后的 `{id,action,revision,snapshot,changed_at}`。组合时不仅要保留数组 ordinality，还必须保持 `snapshot` 的对象键位；删除该键后在 Node 末尾追加会改变 `JSON.stringify` 字节。

## 决策

1. 新增内部 `createWorkoutRevisionSnapshotLayerSnapshot()`，保留既有 header-only 与单 revision 接口，不增加公开路由。
2. 把单 revision 根→exercise→set 责任提炼为可在既有 `PoolClient` 内创建的复用节点。单 revision 会话和多 revision 组合都使用该节点，不复制一套嵌套取消状态机。
3. 当前 workout→exercise→set 关系图与全部 revision snapshot 共享一次 active owner 校验和一个只读 `REPEATABLE READ` 根事务；关系图必须先完整 EOF，history 才能开始。
4. 修订页面由 PostgreSQL 输出含 `snapshot: null` 的 JSONB 骨架。Node 只原地替换现有 `snapshot` 属性为懒快照值，因此保留 `id,action,revision,snapshot,changed_at` 的解析后键序。
5. 每条 revision 在交付后必须完整消费 snapshot exercises，且每个 exercise 又必须完整消费 sets，才能读取下一 revision。跳过、重复、提前停止和源错误都失败关闭整个根事务。
6. shape、snapshot 根、动作和组继续使用第 167–168 轮的严格键集、父级 UUID 唯一、JSON ordinality 与固定最大 64 KiB UTF-8 门禁。未知 shape 在根正文查询前失败。
7. 组合收据在原 workout header/exercise/set/revision 四段之外，增加 snapshot root/exercise/set 三段批次与行数；不记录 owner、workout/revision UUID、shape 正文或训练内容。
8. 主动取消先清理活动 snapshot set 和 exercise，再关闭 history、当前关系父级与根事务；同一根错误拒绝流和收据。只有所有 workouts 到达私有边界后显式 `complete()` 才提交。
9. 本轮不把组合结构接入递归 JSON 编码器、三字段协调器、同步下载、公开 v4、KMS、租约执行、对象存储、下载授权或客户端。

## 影响

本决策的核心边界是“一个所有者校验、一个事实时刻、一个取消根”。当前关系事实、修订信封和不可变快照正文不再由调用方跨事务拼接；父级只有在子级确实到达物理结尾后才能前进。任何结构不明、字段超限或消费不完整都会关闭整条读取链，而不是交付部分历史。

- 当前关系图与完整不可变 history 首次具有同一数据库事实时刻；不会用第二个事务伪装组合。
- 单 revision 与多 revision 共享实现，后续 shape、取消或门禁修正只需维护一个嵌套节点。
- `snapshot: null` 占位加原地替换把对象键序兼容变为 PostgreSQL 可复现行为；真实数据库两条 history 已与同步结构逐字节对账。
- 每条 snapshot 的完整消费成为推进 revision keyset 页面的显式门禁，避免历史截断或兄弟节点并行读取同一连接。
- PostgreSQL 仍会为每条 revision 执行 shape 和 JSONB 分解；本决策限制数据库到 Node 的单元素交付，不声称限制数据库内部计算成本。
- 组合结果仍是 `{header,exercises,history}` 内部结构，尚未成为编码器可直接消费的完整 workout JSON，也未减少同步控制器内存，R-013 保持开放。

## 备选方案

### 为每条 revision 调用现有单修订会话

拒绝。这样会产生多个事务与多次 owner 校验，无法证明当前图和完整 history 属于同一事实时刻。

### 在 Node 手工新建修订对象

拒绝。手工属性插入顺序容易偏离 PostgreSQL JSONB 的规范键序；带 `snapshot: null` 的数据库骨架可以直接作为字节兼容证据。

### 复制单修订三层状态机到 history

拒绝。两份最深层取消、一次性消费和清理聚合逻辑会快速漂移；复用同 `PoolClient` 节点能保持一个权威实现。

### 当前图和多个 revision snapshot 并行读取

拒绝。同一 `PoolClient` 不应承载并行游标责任，而且并行会破坏 v4 字段顺序、背压和确定性取消。

## 验证

- 目标数据库快照单元测试必须为 38/38 项通过；真实 PostgreSQL 文件必须为 31/31 项通过。
- 数据库替身必须证明只创建一个根流、当前关系图先于 history、每条 snapshot 完整后才能推进，以及活动 set 取消先结束嵌套父级。
- 真实 PostgreSQL 必须把两条完整修订物化为 `{id,action,revision,snapshot,changed_at}`，并与直接同步查询的 `JSON.stringify` 逐字节相同。
- 合法反序 position 必须保持 JSON ordinality；未知 shape 必须在修订正文发出前返回固定无内容错误。
- `batchRows=1` 时，组合收据必须分别报告 current header/exercise/set、revision header 和 snapshot root/exercise/set 的批次与行数。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0160：便携归档训练修订头同根顺序生命周期](0160-portable-export-workout-revision-header-lifecycle.md)
- [ADR-0162：便携归档训练修订快照原序递归来源](0162-portable-export-workout-revision-snapshot-ordinality-source.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 169 轮档案](../../iterations/169-portable-export-workout-revision-snapshot-layer.md)
