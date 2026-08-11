# ADR-0155：便携归档训练聚合的嵌套边界

日期：2026-08-11

状态：已采纳

## 背景

第 160 轮建立的描述驱动协调器可以安全迁移“一个数据库行对应一个有界 JSON 对象”的集合。`workouts` 是下一项核心纵向证据，但同步 v4 的一个 workout 同时包含会话头、当前 exercises/sets 关系图和全部 `workout_revisions`。直接把该 SQL 聚合当成第四个行源，必须先证明总序、单元素上限和历史边界。

同步查询原来只按 `(started_at,created_at)` 排序；同时间创建的训练没有唯一尾序。嵌套 exercises、sets 和 history 已分别按 position、position 和 revision 排序，而且数据库在各父级上有唯一约束，因此这些内部键已经形成总序。

现有创建契约允许最多 30 个动作、每动作 50 组，并允许较长名称、器械说明、动作说明与训练备注。真实 PostgreSQL 证明，这个合法当前关系图即使移除 history 也超过现有 64 KiB 单 payload 门禁。修订表每次又保存完整 Workout 快照，修订数量没有上限。把完整 workout 当作单行不是安全的小改动。

## 决策

1. 同步 v4 workout 顶层顺序补强为 `(started_at,created_at,id)` 升序，以 UUID 形成同时间总序。
2. exercises 继续按 `position`、sets 继续按 `position`、history 继续按 `revision` 排序。`UNIQUE (workout_id,position)`、`UNIQUE (exercise_id,position)` 与 `UNIQUE (workout_id,revision)` 已保证这些键在父级内唯一，不增加多余尾序。
3. 真实集成测试必须以反向插入的相同 started/created 时间证明顶层 UUID 顺序，并证明逆序插入的动作、组和修订仍按语义键输出。
4. 测试必须由 `createWorkoutSchema` 接受 30×50 最大结构，再建立等价真实关系图；排除 history 后的导出 workout 若不超过 64 KiB，决策需要重新审阅。
5. 本轮不新增 workout 简单行源、不把它接入 `createConsentHealthSnapshot()`，也不提高 64 KiB 门禁。拒绝合法训练的门禁和允许无界分配的高门禁都不可接受。
6. 后续训练迁移必须先让 JSON 来源类型显式支持递归嵌套懒数组/对象，并证明内层按需启动、逐字节兼容、取消关闭和根生命周期。
7. 数据库来源必须按训练头、动作、组和修订分层。修订 snapshot 若自身超过门禁，还要继续分解或采用有界 token 来源，不能删除历史或退化为不可验证摘要。
8. 当前活动列表索引带有 `WHERE deleted_at IS NULL`，不能覆盖便携导出包含软删除会话的全历史。新增顶层 keyset 前必须设计并验证 owner-scoped 全历史索引，而不是误用活动列表索引。

## 影响

- 同步导出在相同 started/created 时间下获得可复现的 workout 顺序，没有改变导出字段或用户数据。
- 训练的当前值与修订历史继续完整保留；本轮没有为了通过 payload 门禁拆散、截断或摘要化证据。
- 取得了一个确定的结构反例：简单集合迁移模型不适用于 workout，后续工作必须转向递归/分层流。
- 64 KiB 仍是简单数据库 payload 的边界，不因复杂集合而被悄然放宽。
- 训练同步路径仍在 PostgreSQL 和 Node 中完整聚合，内存风险没有下降；R-013 保持开放。
- 没有新迁移。未来全历史索引必须在具体 keyset 查询存在时随查询计划和真实数据库测试一起交付。

## 备选方案

### 直接把完整 workout 接入现有行源

拒绝。合法 30×50 当前图已经超过单元素门禁，修订历史还会继续无界增长。

### 为 workout 提高单 payload 上限

拒绝。提高上限只是把结构性无界聚合重新带入 Node，无法形成与账号规模解耦的内存边界。

### 导出当前训练但丢弃 history

拒绝。修订是用户更正和软删除的来源证据；静默丢弃会损害纵向事实与可纠正性。

### 把每个 workout 拆成多个顶层数组

拒绝。公开 v4 契约要求 workout 内聚，随意拆顶层字段会破坏兼容性并把关联恢复责任转嫁给用户。

### 立即新增全历史索引

拒绝。本轮没有对应异步 keyset 查询；先写索引会在缺少查询计划证据时增加写放大。索引应与分层来源同时设计验证。

## 验证

- `createWorkoutSchema` 必须接受测试中的 30×50 输入，证明反例位于当前产品契约内。
- 真实 PostgreSQL 必须反向插入两个同时间 workout，并让公开导出 UUID 顺序与数据库 `(started_at,created_at,id)` 查询一致。
- 30 个 exercises 与每个 50 个 sets 必须按 position 升序输出；逆序插入的两条 revisions 必须输出 `[1,2]`。
- 把导出大训练的 history 替换为空数组后，UTF-8 JSON 大小仍必须大于 `portableExportSnapshotMaximumPayloadBytes`。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0151：便携归档数据库 payload 的 UTF-8 交付门禁](0151-portable-export-database-payload-byte-gate.md)
- [ADR-0153：便携归档健康历史的同事务根生命周期](0153-portable-export-health-history-root-lifecycle.md)
- [ADR-0154：便携归档同意证据的协调快照](0154-portable-export-consent-coordinated-snapshot.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 161 轮档案](../../iterations/161-portable-export-workout-nested-boundary.md)
