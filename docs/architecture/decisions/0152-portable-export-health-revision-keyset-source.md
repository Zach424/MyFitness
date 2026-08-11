# ADR-0152：便携归档健康修订的有界 keyset 行源

日期：2026-08-11

状态：已采纳

## 背景

第 155–157 轮已经为 `healthRecords` 建立只读 repeatable-read 行源、懒 v4 JSON 组合和 64 KiB 单 payload 交付门禁。完整导出仍把 `healthRecordRevisions` 一次性读取为 JavaScript 数组；修订数量会随用户更正持续增长，而且它保存“原事实如何被纠正”的纵向证据，优先级高于固定小字段的同意事件。

同步导出原排序只有 `(changed_at, revision)`。不同记录可以拥有相同变更时间和相同修订号，缺少唯一尾键会让分页边界不确定；现有索引 `(user_id, record_id, revision DESC)` 也不能支持按所有者的全历史导出扫描。新行源必须先固定数据库总序，再复用既有字节门禁和事务收据。

## 决策

1. 迁移 0031 新增 `health_record_revisions_user_export_idx`，精确列序为 `(user_id, changed_at, revision, id)`；导出顺序固定为后三列升序。
2. `createHealthRecordRevisionSnapshot()` 只读取 active owner 的修订投影，字段与现有 v4 同步导出保持一致，不暴露 `user_id`。默认每批 25 行、最大 100 行。
3. 应用层续页只保存末行 UUID；下一页在同一只读 `REPEATABLE READ` 事务中用该 UUID 回查 `(changed_at, revision, id)`，再执行原生元组比较。数据库时间不经过 JavaScript `Date`。
4. 健康记录与修订共用 `PortableExportDatabaseSnapshotOptions`、完成收据、active owner 门禁、页面完整性校验、64 KiB UTF-8 payload 交付门禁、固定超限错误和 EOF/取消语义。原健康记录行为必须保持不变。
5. 修订行可作为 `healthRecordRevisions` 的显式懒数组进入现有 v4 JSON 编码器；静态合法的其他字段保持不变，输出必须与相同行的 eager v4 逐字节相同。
6. 真实测试必须覆盖同微秒且同 revision 的 UUID 总序、三页不重不漏、并发追加不可见、其他 owner 排除、索引定义、超限内容不出库和数据库/JSON 收据同根失败。
7. 本轮建立的是第二个独立事务行源，不把健康记录与修订放入同一事务。两份独立组合证明不能宣称一份完整 v4 具有单时刻一致性；多集合协调与字段间取消留给后续专门决策。

## 影响

- 高频纵向修订不再必须先形成完整数组才能进入 v4 字节流，且单页交付最多为 100 × 64 KiB payload 文本加固定开销。
- `(changed_at, revision, id)` 为所有者修订历史建立稳定总序；同时间/同修订的不同记录由 UUID 收束，微秒不会被应用层截断。
- 共用快照内核减少两套批次、payload 解析、收据与失败代码漂移；健康记录既有测试继续证明重构等价。
- 新索引增加修订写入和数据库存储成本；这是换取所有者全历史 keyset 扫描的明确成本。
- 两个独立事务可能看到不同提交时刻。未来若直接把两个源同时放进 v4，就会破坏“一个文件一个事实快照”的语义，因此当前禁止这种组合声明。
- 其他十一个顶层数组、嵌套聚合和媒体仍是 eager；R-013 继续开放。

## 备选方案

### 优先迁移 `consentEvents`

暂缓。同意事件字段小且已有稳定历史索引，迁移成本更低，但体量和内存压力通常较小；健康修订更能体现纵向状态与用户更正权，也更能验证 64 KiB 门禁复用。

### 使用 `(changed_at, revision)` 分页

拒绝。不同记录可以同时拥有相同 revision，时间戳也可以相同；缺少 UUID 尾键时边界不是全序，可能重复或遗漏。

### 把 `(changed_at, revision)` 返回 JavaScript 作为游标

拒绝。`TIMESTAMPTZ` 可保存微秒，而默认 `pg` 时间解析只有毫秒精度。只保存 UUID 并在同一快照回查锚点可避免精度转换。

### 本轮同时实现多集合事务协调器

暂缓。现有 JSON 取消能关闭活动懒数组，但在两个字段之间没有根级数据库会话保管钩子；把协调器与第二个 SQL 行源混在一轮会扩大取消/提交证明面。先证明修订自身，再单独设计根生命周期。

## 验证

- 迁移后必须能从 `pg_indexes` 读取精确 `(user_id, changed_at, revision, id)` 定义。
- 五条 owner 修订以两行批次跨三页读取；同时间/同 revision 由 UUID 排序，不重复、不遗漏，其他 owner 不出现。
- 第一页后并发追加不得进入既有快照；新快照可以读取该修订。
- 六条修订的 lazy v4 必须以不超过 41 字节的块输出，并与 eager 产物、字节数和 SHA-256 对账。
- 异常修订 JSONB 必须在数据库 payload 门禁处拒绝，敏感标记不得进入 JSON，三层失败保持同一错误对象。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0149：便携归档的只读快照事务与首个 keyset 行源](0149-portable-export-repeatable-read-keyset-source.md)
- [ADR-0150：便携归档 v4 JSON 的可组合异步数组](0150-portable-export-composable-async-json-arrays.md)
- [ADR-0151：便携归档数据库 payload 的 UTF-8 交付门禁](0151-portable-export-database-payload-byte-gate.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 158 轮档案](../../iterations/158-portable-export-health-revision-keyset-source.md)
