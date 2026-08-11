# ADR-0151：便携归档数据库 payload 的 UTF-8 交付门禁

日期：2026-08-11

状态：已采纳

## 背景

第 155–156 轮已经让 `healthRecords` 在一个只读 `REPEATABLE READ` 事务中按行分页，并通过懒数组直接进入 v4 JSON 字节流。每批最多 100 行、JSON 输出块也有固定上限，但这两个限制都不能约束单行 JSONB；历史迁移、运维直写或未来字段扩展仍可能让一个 `source_metadata` 异常膨胀。原实现让 `pg` 先接收并解析完整 JSONB，再由全文件 `maximumBytes` 拒绝，因而“有界”只覆盖行数，没有覆盖数据库向应用进程交付的单元素大小。

健康记录的公开写入契约已对来源字段逐项限长，但归档必须面向数据库中实际存在的历史事实，不能把入口校验误当成持久数据永远合规。门禁还必须保留既有所有者隔离、微秒 keyset、事务寿命、懒 JSON 格式和错误传播语义。

## 决策

1. 健康记录快照新增 `maximumPayloadBytes`，默认值与绝对最大值均为 64 KiB（65,536 字节）。调用方可以为测试或更严格策略向下收紧，但不能放大上限；非安全整数、零、负数或超出绝对上限都在打开数据库流前失败。
2. PostgreSQL 继续使用既有字段投影和 `(occurred_at, created_at, id)` 排序。每页先以 `to_jsonb(page)::text` 形成数据库 JSON 文本，再用 `octet_length` 按数据库 UTF-8 编码精确计量。
3. SQL 只在 `payload_byte_length <= maximumPayloadBytes` 时返回 `payload_text`；超限行返回 `NULL` payload 与实际字节数。Node 先校验字节数，再解析文本，因此超限内容不会进入 `pg` 结果 payload 或 JavaScript 对象图。
4. 新增 `PortableExportSnapshotPayloadTooLargeError`，固定内部代码为 `portable_export_snapshot_payload_too_large`，只保留上限和实际字节数。错误消息不得包含记录 UUID、来源元数据或健康内容。
5. 快照完成收据新增 `maximumPayloadBytes`，使批次行数与单元素门禁同时可对账。超限错误保持原对象，依次拒绝行源、数据库快照收据和外层 JSON 收据；不得把部分前缀标记为完成。
6. 等于门槛的 payload 合法；非法字节数、门槛内却缺失文本、无效 JSON、非对象 payload 或 payload/排序行 ID 不一致仍使用既有无内容的页面完整性错误失败关闭。
7. 本轮只封闭 `healthRecords` 的数据库→Node 交付边界，不修改同步 HTTP 导出，不迁移第二个集合，不声称 PostgreSQL 内部编码内存、完整文件大小或其他集合已经有界，也不增加 KMS、worker、公开路由、下载授权或 UI。

## 影响

- 单个异常 JSONB 不再以完整 payload 进入 Node；每个合法页面最多交付 100 × 64 KiB 的 payload 文本，另有固定行元数据和驱动开销。
- 数据库独立测量值、错误 `actualBytes` 与完成收据形成可复核边界；固定错误不泄露敏感记录标识或内容。
- 文本在应用层显式 `JSON.parse`，但合法 v4 内容和 eager/lazy 字节证明保持不变；既有微秒顺序、并发隔离、取消回滚与 EOF 提交不变。
- PostgreSQL 仍必须在数据库内部把候选行编码成 JSON 文本才能得出精确字节数；该门禁限制跨进程交付，不是数据库资源配额。未来执行器仍需租约截止、查询超时和数据库可观测性。
- 其他十二个顶层数组、嵌套聚合与媒体没有获得该门禁；R-013 继续开放。

## 备选方案

### 依赖健康记录入口 Schema 的字段长度

拒绝。入口约束不能证明历史迁移、直接 SQL、恢复数据或未来 Schema 中的持久行始终符合当前契约，归档必须验证读取边界上的真实数据。

### 在 Node 收到 JSONB 后使用 `Buffer.byteLength(JSON.stringify(payload))`

拒绝。计量发生时完整对象已经跨过数据库驱动并被解析，不能封闭需要解决的进程内存边界；重新序列化还会建立额外字符串。

### 只依赖全文件 50 MiB 门禁

拒绝。全文件门禁控制最终产物，不限制单行进入应用进程前的峰值，也不能让后续集合迁移共享统一元素契约。

### 使用 `pg_column_size(jsonb)`

拒绝。它度量 PostgreSQL 内部表示，不等于通过文本协议交付和解析的 UTF-8 JSON 字节。`octet_length(payload_text)` 与实际交付边界更直接。

## 验证

- 单元测试必须覆盖非法上下限、等于门槛的 UTF-8 payload、超限固定错误、无内容消息和行源/收据同根失败。
- 真实 PostgreSQL 必须插入绕过公开 Schema 的异常 `source_metadata`，独立测量 `octet_length(to_jsonb(record)::text)`，并证明错误 `actualBytes` 相等。
- 超限组合的外层 JSON 字节不得包含敏感标记，数据库快照收据与 JSON 收据必须拒绝同一个根错误。
- 既有微秒 keyset、并发隔离、active owner、取消回滚、lazy/eager 字节兼容和完整回归必须继续通过。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0149：便携归档的只读快照事务与首个 keyset 行源](0149-portable-export-repeatable-read-keyset-source.md)
- [ADR-0150：便携归档 v4 JSON 的可组合异步数组](0150-portable-export-composable-async-json-arrays.md)
- [PostgreSQL 字符串函数](https://www.postgresql.org/docs/current/functions-string.html)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 157 轮档案](../../iterations/157-portable-export-database-payload-byte-gate.md)
