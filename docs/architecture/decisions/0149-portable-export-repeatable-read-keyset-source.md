# ADR-0149：便携归档的只读快照事务与首个 keyset 行源

日期：2026-08-11

状态：已采纳

## 背景

第 153–154 轮已经能把完整 `PrivacyExport` 增量编码、认证加密并按 multipart 写入私有对象，但数据库查询仍先把全部集合组装为 JavaScript 数组。未来若各集合各自开启事务，即使每个查询分页，也会把不同提交时刻混成一个文件；若异步生成器在事务提交后才被消费，则所谓快照同样失效。

PostgreSQL 的 `REPEATABLE READ` 会让同一事务中的连续 `SELECT` 看到第一个非事务控制语句建立的稳定快照。该保证必须覆盖字节源的完整消费寿命；调用方提前停止时不能提交一个未完成读取。健康记录的排序键含 `TIMESTAMPTZ`，而 JavaScript `Date` 只有毫秒精度，因此续页也不能把数据库微秒值往返应用层。

## 决策

1. `DatabaseService` 新增延迟开启的 `streamReadOnlyRepeatableRead()`。生成器第一次推进时取得一个池连接并执行 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`；只有操作源到达物理 EOF 后才 `COMMIT`。
2. 操作错误、AbortSignal 或调用方提前 `return()` 都保持事务未完成并执行 `ROLLBACK`，随后释放连接。操作与回滚/释放同时失败时用有序 `AggregateError` 保留全部错误，不能让清理失败覆盖根因。
3. 首个 `PortableExportDatabaseSnapshotService.createHealthRecordSnapshot()` 只读取 active owner 的 `healthRecords`。默认每批 25 行，配置只接受 1–100 行；完成收据只含批次上限、实际非空批次数和行数。
4. 排序固定为 `(occurred_at, created_at, id)` 升序。应用层只保存上一批末尾 UUID；下一页在同一 owner、同一快照中通过该 UUID 子查询原始三元组再做 keyset 比较。时间值不进入 JavaScript 游标，不使用 `OFFSET`。
5. 每页不得超过请求上限，页内 UUID 必须唯一，且 JSON payload 的 `id` 必须与排序行相同；任何不一致都失败关闭。行数必须保持 JavaScript 安全整数。
6. 本轮只建立健康记录行源，不修改同步 `/v1/me/privacy/export`，不把行源接入完整 v4 JSON，不迁移健康修订、目录、训练、餐食、计划、AI 或照片集合，也不增加迁移、worker、KMS、公开路由、下载授权或 UI。
7. 行数批次只是集合基数上界，不是单行 JSON 字节上界；在扩大到任意 JSONB/嵌套聚合前必须增加逐行/逐片段字节门禁。

## 影响

- 未来完整 v4 懒加载树可以在一个连接和一个稳定所有者快照中按需读取，而不是先生成全部数组。
- UUID 锚点子查询保留 PostgreSQL 原始微秒精度，同毫秒记录不会因 JavaScript 时间截断而重复或遗漏。
- 慢速加密或对象上传会延长只读事务寿命；这换取了快照一致性，也会保留 MVCC 旧版本。未来执行器必须施加租约/截止时间并监测长事务，而不能无限挂起。
- 只读 repeatable-read 不会把并发插入或更新混入后续页，但它不是按事务时间重建历史，也不替代业务所有权和归档状态机。
- 当前仅一个平坦集合受益，完整 `PrivacyExport`、同步下载峰值和其他集合驻留均未下降；R-013 继续开放。

## 备选方案

### 每页使用独立 Read Committed 查询

拒绝。后续页面会看到并发提交，导出可能混合不同事实时刻；keyset 只能稳定排序边界，不能固定快照内容。

### 把 `(occurred_at, created_at)` 作为 JavaScript 游标

拒绝。`pg` 默认把 `TIMESTAMPTZ` 解析为毫秒级 `Date`，而 PostgreSQL 可保存微秒；同毫秒多行会出现边界收缩或扩张。只保存 UUID 并回查数据库锚点可避免精度转换。

### 使用 `OFFSET/LIMIT`

拒绝。即使快照固定，OFFSET 会随账号规模重复扫描前缀；稳定唯一 keyset 更符合持续流式读取。

### 一次重写全部 v4 集合

暂缓。训练、餐食、计划含嵌套子集合，照片还涉及对象读取和 base64；先证明事务寿命、取消与微秒分页，能把最危险的跨页语义单独验证。

## 验证

- 单元测试必须证明完整消费后才提交，提前停止会回滚并释放连接，操作与回滚双失败以根因在前的 `AggregateError` 保留。
- 真实 PostgreSQL 以同一毫秒内五个不同微秒时间生成三页；顺序必须与数据库一致，UUID 不重复、不遗漏。
- 第一页后并发插入和更新必须对当前源不可见，其他 owner 行不得出现；非 active owner 必须在发布任何行前失败。
- AbortSignal 在首行后取消时，行源与完成收据都拒绝，不能发布完成。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0148：私有对象的有界 multipart 字节流写入](0148-private-object-bounded-multipart-stream.md)
- [PostgreSQL 事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL BEGIN](https://www.postgresql.org/docs/current/sql-begin.html)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 155 轮档案](../../iterations/155-portable-export-repeatable-read-keyset-source.md)
