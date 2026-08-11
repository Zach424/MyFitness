# ADR-0164：便携归档训练完整懒 JSON 来源

日期：2026-08-11

状态：已采纳

## 背景

第 169 轮已经把 workout 当前关系图和全部不可变 revision snapshot 放进一个 active-owner、只读 `REPEATABLE READ` 根事务，但内部会话按当前关系图后 history 的顺序交付。同步 v4 的最终字节不是由 TypeScript 手工对象顺序决定，而是来自 PostgreSQL JSONB 投影；真实查询确认 workout 对象先枚举 `history`，再枚举 `exercises`。如果直接把旧会话连接到递归 JSON 编码器，就必须缓存整个关系图、打开第二个事务，或改变既有公开字节，这三种结果都违背有界内存、同一事实时刻或格式兼容目标。

完整 workout 还包含多层数组：history 的 revision→snapshot→exercise→set，以及当前 exercise→set。适配器必须让编码器逐层拉取这些数组，并让 JSON 根的完成或取消承担同一数据库会话的生命周期，不能在适配层创建第二套提交权威。

## 决策

1. 保留关系优先的 `createWorkoutRevisionSnapshotLayerSnapshot()` 行为，新增内部 `createWorkoutRevisionSnapshotJsonLayerSnapshot()`；两者复用同一七层状态机，只以明确模式选择字段开放顺序。
2. JSON 模式严格按 PostgreSQL JSONB 的实际 workout 键序读取完整 history，再读取当前 exercises。当前 revision snapshot 未完整到达 EOF 时，不能推进下一 revision；history 未结束时，当前关系图不得开始。
3. PostgreSQL 为 workout 交付带 `history: []` 和 `exercises: []` 的有界 JSONB 骨架，为当前 exercise 交付带 `sets: []` 的骨架；revision 继续使用 `snapshot: null`，snapshot exercise 继续使用 `sets: []`。Node 只原位替换既有属性，不删除并重新追加键。
4. 新增 `createPortableExportWorkoutJsonSource()`，把 workout、当前动作、revision snapshot 动作和各自 set 迭代器包装为私有 `PortableExportJsonAsyncArray`。普通业务 iterable 仍不会被隐式当作 JSON 数组。
5. 适配器不预取子数组。字段物理 EOF 后调用数据库会话 `complete()`；任意深度提前停止先关闭活动子迭代器，再调用同一会话 `cancel()`。数据库最深层错误优先于通用 JSON 未完成错误，JSON 与数据库收据必须拒绝为同一根错误。
6. workout、exercise、revision、snapshot root、snapshot exercise 和 set 继续分别执行 PostgreSQL 内 64 KiB UTF-8 单元素门禁、父级 UUID 唯一、JSON ordinality、一次性消费和显式完成约束。
7. 本轮只建立完整 `workouts` 数组的内部懒 JSON 来源，不增加迁移，不修改同步控制器，不新增公开路由，也不把独立训练事务拼接到前三字段协调器。
8. 后续跨顶层协调必须遵守 v4 固定顺序；在 workouts 之前先实现 `exerciseCatalog` 和 `foodCatalog` 的有界字段，禁止通过跨事务拼接或整体缓存跳过结构依赖。

## 影响

- 完整 workout 首次可以被现有增量 JSON 编码器逐层消费，不需要在 Node 中组装当前关系图或全部修订历史。
- 关系优先旧入口保持兼容，JSON 字节兼容则由单独的显式模式保证；两种接口不会复制 shape、分页、取消或收据状态机。
- PostgreSQL 骨架与原位替换让对象键序成为可复现的数据库行为。真实数据库以 37 字节块证明完整 `workouts` eager/lazy 输出逐字节相同。
- 活动不可变 set 上取消会先关闭 set/exercise/history，再取消根事务；迭代错误、JSON 收据和数据库收据共享同一最深层失败。
- 该来源仍是独立事务，不能证明 consent、health、catalog 和 workout 属于同一事实时刻，也未减少现有同步公开导出的内存占用。R-013 继续开放。

## 备选方案

### 在适配器缓存当前关系图，等 history 输出后再编码

拒绝。合法 30×50 当前关系图已经证明可超过单元素门禁，缓存会重新引入无界 Node 对象图，并使背压证据失真。

### 为 history 和当前关系图分别打开事务

拒绝。两个事务不能证明当前事实与修订证据来自同一数据库时刻，且会重复 owner 校验和取消责任。

### 改变 workout JSON 键序以符合关系优先会话

拒绝。现有同步 v4 和真实 JSONB 表示已经固定字节兼容，改变键序会破坏已导出文件的逐字节确定性。

### 复制一套只服务 JSON 的七层实现

拒绝。shape、父级 UUID、ordinality、分页、门禁与最深层取消需要一个权威状态机；复制实现会使两种入口快速漂移。

## 验证

- 数据库替身必须证明 JSON 模式拒绝在 history 完成前读取当前 exercises，并保留旧关系优先入口的既有回归。
- 适配器单元必须证明零预取、`history→snapshot exercise→snapshot set→current exercise→current set` 的拉取顺序、完整字节等价和嵌套取消顺序。
- 真实 PostgreSQL 必须把完整懒 `workouts` 数组与同步 v4 workout 聚合逐字节比较，块大小固定为 37 字节。
- 在活动 revision snapshot set 中取消时，迭代器、JSON 收据和数据库收据必须由同一最深层错误拒绝，且连接回滚释放。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0163：便携归档训练完整修订快照同根组合](0163-portable-export-workout-revision-snapshot-layer.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 170 轮档案](../../iterations/170-portable-export-workout-lazy-json-source.md)
