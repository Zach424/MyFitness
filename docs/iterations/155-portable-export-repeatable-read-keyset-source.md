# 第 155 轮：便携归档只读快照与首个 keyset 行源

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。按“影响 × 置信度 × 基础价值 / 成本”比较完整数据库懒加载、租约执行器和 KMS lease 后，先处理数据库快照寿命与时间精度：如果分页源不共享同一事务，后续完整 JSON 只会把多个事实时刻拼在一起；如果时间游标经过 JavaScript `Date`，微秒记录可能在页边界丢失。KMS 仍缺真实提供方证据，执行器若先接完整 `PrivacyExport` 则会延续已量化的内存压力。

范围只增加一个通用只读 repeatable-read 流事务和首个 owner-scoped `healthRecords` keyset 行源。同步导出、完整 v4 JSON、其他集合、嵌套聚合、照片媒体、归档状态、worker、KMS、下载授权、公开 API 和客户端均不改变。

验收标准固定为：事务只在源物理 EOF 后提交；提前停止、错误和取消回滚并释放连接；根因不被清理错误覆盖；每批 1–100 行；续页只保存 UUID 并由数据库快照回查精确时间元组；同毫秒微秒行跨页不丢不重；并发插入/更新不混入；跨 owner、非 active owner 和取消失败关闭；收据只在提交后发布。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/database/database.service.ts`：新增 `streamReadOnlyRepeatableRead()`，把池连接、BEGIN/COMMIT/ROLLBACK/release 与异步消费寿命绑定。
- `apps/api/src/database/database.service.test.ts`：覆盖完整提交、提前停止回滚和操作/回滚双错误顺序。
- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增内部健康记录快照会话、25/100 行批次门禁、UUID 锚点 keyset、active owner 校验、取消和完成收据。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`：覆盖收据提交时机、批次数/行数、非法配置和不完整消费。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`：用真实 PostgreSQL 覆盖微秒边界、三页顺序、并发写入隔离、所有者/状态和取消。
- `apps/api/src/app.module.ts`：注册内部快照服务，不新增控制器或公开路由。
- ADR-0149 固定事务寿命、UUID 锚点、行数边界、失败清理和未完成范围；架构、数据库、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

### 让事务服从消费寿命

数据库方法返回延迟异步生成器。第一次 `next()` 才取连接并开始只读 repeatable-read；只有操作生成器真正返回后才提交。调用方 `return()` 会进入 `finally`，事务仍标记为 open，因此执行回滚后释放连接。提交或查询失败也走同一责任边界。

### 在清理失败时保留根因

操作错误、回滚错误和连接释放错误分别捕获。存在操作根因时，清理错误按“操作 → 回滚 → 释放”的顺序进入 `AggregateError`；只有单一错误时保留原对象。这样未来执行器可以区分数据源失败和事务清理责任，而不会记录一个误导性的普通失败。

### 用 UUID 回查精确数据库排序键

健康记录按 `(occurred_at, created_at, id)` 升序。应用层不保存 `Date`；只保存上一页末 UUID，下一页在相同 user/snapshot 中回查该行原始三元组再比较。该模式沿用项目已有“UUID 游标 + 数据库锚点”的精度经验，并避免 OFFSET 扩展成本。

### 完成收据不代表完整导出

收据只记录配置批次上限、非空批次数和行数，并且在底层事务提交之后解析。它不含 owner、健康值、时间、UUID 或 SQL，也不声称 JSON、加密或对象已经完成。提前停止即使已经读出一部分行，收据仍拒绝。

## 4. 验证证据

- 新增 2 个单元文件、6/6 项目标测试通过；完整单元为 98 个文件、506/506 项。
- 新增 1 个真实 PostgreSQL 集成文件、2/2 项目标测试通过；完整集成为 23 个文件、78/78 项。
- 五个 `2026-08-11T01:00:00.00000xZ` 健康记录以每批 2 行形成三批，输出 UUID 顺序与原始微秒顺序一致。
- 第一行发布后插入一个位于中间排序位置的新记录，并更新尚未读取页的一行；当前快照仍只输出原五行和更新前数值，其他 owner 行未出现。
- disabled owner 在任何行发布前失败；首行后 AbortSignal 使行源与收据同时拒绝。单元测试另证明提前 `return()` 使用 ROLLBACK 而非 COMMIT，操作/回滚双失败保留两个错误。
- 本轮没有客户端源码、UI、路由或产品文案变化，因此不重复浏览器套件与双端构建；最近完整 Chromium 基线仍为 95/95，H5/WeApp 产物沿用第 146 轮实测。
- 完整 strict 类型、生产构建、格式、生产依赖、中文和文档索引门禁均通过。
- Obsidian 镜像完成写入并逐字节验证：68,024 字节，SHA-256 为 `1372f8ea214623a49bec8f5a712f30c165da0d83ce23783137373261ce14f377`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- keyset 分页不自动等于快照；只有所有页位于同一 repeatable-read 事务中，才能阻止并发提交混入。
- `TIMESTAMPTZ` 经默认 `pg` → JavaScript `Date` 会失去微秒。内部游标只保存 UUID，再由数据库锚点回查完整排序键，既减少敏感游标内容，也保留精度。
- 异步生成器提前停止不是成功完成。事务生成器必须把 `return()` 识别为未完成并回滚，完成收据也必须拒绝。
- 长寿命 repeatable-read 会延迟 PostgreSQL 清理旧版本；未来执行器必须有租约/截止时间、取消和长事务观测，不能把流无限挂起。
- 行数上限限制集合宽度，不限制恶意或异常单行 JSONB 大小。迁移嵌套聚合前必须增加逐行/片段字节门禁，不能把“每批 100 行”描述成固定内存字节。
- 本轮只证明一个平坦集合，尚未减少当前同步导出或完整异步 v4 的实测峰值。

## 6. 全局状态、项目反思与下一步

本轮先把数据库读取的时间一致性、所有权和取消责任固定下来，使后续逐集合迁移不会用错误分页换取表面流式化。它保护长期健康事实在导出时形成一个一致视图，不改变任何用户确认事实、状态估计、AI 计划或医疗边界。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一轮应优先让现有 JSON 编码器接受可组合的异步数组/对象节点，并把首个健康记录行源嵌入与 v4 逐字节兼容的最小完整夹具；若该成本过高，再先迁移同样平坦的健康修订源。两条路径都必须保持一个事务、完成收据和单行字节风险的诚实边界。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 154 轮档案](154-private-object-bounded-multipart-stream.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0149](../architecture/decisions/0149-portable-export-repeatable-read-keyset-source.md)
