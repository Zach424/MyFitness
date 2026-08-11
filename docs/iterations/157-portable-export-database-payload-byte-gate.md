# 第 157 轮：便携归档数据库 payload 字节门禁

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。按“影响 × 置信度 × 基础价值 / 成本”比较第二个集合迁移、执行器连接和单元素门禁后，最高杠杆是先封闭健康记录数据库 payload 的交付大小；否则单个异常 JSONB 仍可绕过每批 100 行限制，在进入 JSON 全文件门禁前占用 Node 内存。

验收标准固定为：数据库按 UTF-8 精确计量单行；默认且绝对上限为 64 KiB；超限时只返回字节数、不返回或解析 payload；错误不含记录标识/内容，行源、数据库收据和 JSON 收据保持同一根错误；等于边界的 Unicode 内容合法，既有所有者、keyset、事务、字节兼容和取消语义不变。

范围不修改同步 HTTP 导出，不迁移第二个集合、嵌套聚合或媒体，不增加归档执行器、KMS、公开路由、下载授权和客户端。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增 64 KiB 绝对上限、选项校验、收据字段和固定超限错误；SQL 在 PostgreSQL 内完成 JSON 文本编码、UTF-8 计量和条件返回。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`：覆盖上下限、等边界 Unicode payload、超限消息最小化及同根收据失败。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`：真实 PostgreSQL 插入异常 JSONB，独立对账字节数，并组合懒 v4 JSON 验证敏感标记不出库和三层同根失败。
- ADR-0151 固定数据库→Node 交付边界、错误最小化和未覆盖范围；架构、数据库、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 156 轮档案、项目状态、ADR-0149 与 ADR-0150，确认最新明确风险正是“行数有界但单元素无界”。
2. 在调用数据库流前验证 `maximumPayloadBytes` 为 1–65,536 的安全整数；默认使用绝对上限，并把最终值写入完成收据。
3. 保留原字段投影与 keyset 条件，使用 materialized page/encoded CTE 生成 `payload_text`；最终投影以 `octet_length` 判断是否返回文本，同时始终返回实际字节数。
4. 应用层先验证数据库字节数：超限立即抛出 `PortableExportSnapshotPayloadTooLargeError`；门槛内才执行 `JSON.parse`，并继续校验对象形状和 payload ID。
5. 为异常直写数据建立真实组合测试：数据库独立查询得到期望字节数，外层 JSON 收集失败前缀并检查其中没有敏感标记，三份失败结果使用对象恒等性对账。
6. 先运行目标单元、API strict 类型和目标 PostgreSQL，再运行完整单元、集成、类型、构建及文档/依赖门禁。

## 4. 验证证据

- 数据库快照目标文件为 5/5 项单元测试通过；完整单元为 98 个文件、510/510 项。
- PostgreSQL 快照组合文件为 5/5 项集成测试通过；完整集成为 23 个文件、81/81 项。
- 等于配置字节数的 Unicode payload 被接受，收据记录相同 `maximumPayloadBytes`；零和超过 65,536 的配置在打开流前拒绝。
- 真实异常 `source_metadata` 的数据库独立 UTF-8 测量与错误 `actualBytes` 相等，外层 JSON 前缀不含敏感标记，行源/数据库/JSON 收据保留同一错误对象。
- 既有五条微秒记录三页读取、并发插入/更新隔离、active owner、取消回滚、三条健康记录 lazy/eager 字节等价测试继续通过。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算警告和 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式、生产依赖、中文与文档索引门禁均通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- Obsidian 镜像完成写入并逐字节验证：68,450 字节，SHA-256 为 `b48e411ff38bf4283692a176442b5ff1f2e7be05d583f8bdaf7847cb021ae0d0`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 写入入口 Schema 的字段上限只能保护新请求，不能替代读取历史持久数据时的防御；导出边界必须针对数据库事实重新验证。
- `pg_column_size` 反映数据库内部表示，不能代表文本协议交付的 JSON；`octet_length(to_jsonb(row)::text)` 才与本轮跨进程 UTF-8 边界一致。
- 若在 Node 收到 JSONB 后再计量，超限对象已经被驱动解析，门禁位置过晚。让 SQL 用 `CASE` 返回 `NULL` payload 可以保留可观测字节数而不传输内容。
- 64 KiB × 100 行只给应用交付建立约 6.25 MiB payload 文本上界；PostgreSQL 仍要编码候选行，未来执行器还需要查询超时、租约截止和数据库资源观测。
- 固定错误可以携带上限与实际大小用于运维对账，但不需要记录 UUID 或内容；最小化失败信息同样属于敏感数据保管边界。

## 6. 全局状态、项目反思与下一步

本轮把第 155 轮的“批次有界”和第 156 轮的“消费有界”补成首个“单元素交付有界”集合。它提高了异步导出处理历史异常数据时的可预测性，但没有改变任何用户健康事实、AI 状态或同步下载实现，也不能从一个集合外推完整对象图。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一轮应比较 `healthRecordRevisions` 与 `consentEvents`，选择排序/所有者边界最清晰且能复用 UUID 锚点、64 KiB payload 门禁和懒数组组合的第二个平坦集合。一次只迁移一个集合，并为其独立证明快照一致、格式兼容与取消/超限失败。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 156 轮档案](156-portable-export-composable-async-json-arrays.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0151](../architecture/decisions/0151-portable-export-database-payload-byte-gate.md)
