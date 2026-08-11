# 第 171 轮：便携归档动作目录分层协调来源

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把同步 v4 的 `exerciseCatalog` 建成第四个协调字段。验收标准为：冻结自定义 owner 数据与内置 starter 的边界；活动和归档条目按稳定 keyset 顺序读取；无上限 history 拆为 revision 子流；条目与修订分别执行 64 KiB 门禁；四字段共享同一 repeatable-read 事实时刻；递归 JSON 与同步投影逐字节相同；任意嵌套取消以最深层错误回滚并拒绝统一收据。

本轮不实现 `foodCatalog`、不把 workouts 接入四字段协调器、不修改公开同步下载，也不新增 KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0033_portable_export_exercise_catalog_index.sql`
  - 新增 `user_exercise_catalog_entries (user_id,created_at,id)` 非部分索引，覆盖活动与归档条目的全历史导出顺序。
- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增条目骨架与 revision 页面查询、两层 keyset、两层 64 KiB 门禁和嵌套 history 生命周期。
  - 新增 `createConsentHealthExerciseCatalogSnapshot()`；同意、健康当前、健康修订与动作目录共享一个根事务和一次 active owner 校验。
  - 收据新增条目与修订的独立批次/行数；协调器新增嵌套根失败回调，避免具体 history 错误被通用字段错误覆盖。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.ts`
  - 新增四字段 JSON 适配器，把顶层数组和条目 history 递归标记为私有懒数组，并透传同一完成/取消生命周期。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`
  - 新增四字段顺序/收据、跳过 history、超限 revision 内容不出库证明。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.test.ts`
  - 新增原键位字节等价与活动 history 先关闭后取消根会话证明。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 新增真实 PostgreSQL owner/starter 边界、归档、并发隔离、索引计划、同步/懒字节对账和活动 history 同根取消。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增迁移 0033 精确 owner 导出索引列序门禁。
- `docs/architecture/decisions/0165-portable-export-exercise-catalog-coordinated-source.md`
  - 固定 owner/starter、条目/history 分层、根错误优先和下一字段顺序决策。
- 项目状态、架构、数据库、训练模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读项目状态、第 170 轮和 ADR-0164，把范围冻结为 v4 第四字段，不提前连接 food catalog 或 workout。
2. 审计同步查询和 ADR-0035，确认导出只读取 `user_exercise_catalog_entries`，内置 starter 只服务活动选择器。
3. 识别 revision 数量无上限，拒绝把完整 history 作为单行；设计含 `history: []` 的条目骨架和独立 revision 子流。
4. 以 `(created_at,id)` 和 revision 建立两层 keyset；新增迁移 0033，history 复用既有 owner/entry/revision 降序索引的反向扫描。
5. 复用 PostgreSQL `octet_length` 门禁和固定无内容错误，让条目与每条修订各自不超过 64 KiB。
6. 把目录 row factory 加入描述驱动协调器，保持前三字段接口兼容；用嵌套失败回调把活动 history 错误提升为根事务唯一失败。
7. 原位把条目 `history` 替换为私有 JSON 懒数组，四个顶层字段的完成/取消直接委托同一协调会话。
8. 先跑目标替身与适配器测试，再跑真实 PostgreSQL 和完整质量门禁；最后更新中文文档与 Obsidian 并提交。

## 4. 验证证据

- 目标单元测试：3 个文件、65/65 项通过。
- 目标真实 PostgreSQL 文件：35/35 项串行通过。
- 完整单元测试：100 个文件、556/556 项通过。
- 完整集成测试：23 个文件、112/112 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck、生产构建与格式检查通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库证明活动和归档 owner 条目均输出，其他 owner 与 starter 不输出；前三字段结束后新增的目录条目对已打开快照不可见。
- `EXPLAIN` 在关闭顺序扫描时命中 `user_exercise_catalog_entries_user_export_idx`。
- 完整四字段以 41 字节块增量编码，与同步 v4 `exerciseCatalog` 聚合逐字节相同。
- 条目和 revision 收据独立计数；超限 revision 正文不进入 Node 或错误。
- 活动 history 中止时，history 未完成错误先关闭根事务，迭代返回、JSON 收据和数据库收据引用同一错误。
- 本轮新增迁移 0033；中文文档与迁移索引门禁通过，`docs/` 共 365 份 Markdown，第 090–171 轮 82 份、ADR-0085–0165 81 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像写入并逐字节验证通过：69,122 字节，SHA-256 `82b3628bf3e703f65e633606143b6df71213f1186ee9ef71dbfdcb02455e36b7`。

## 5. 发现的问题与经验

- UI 组合目录不等于隐私导出边界。starter 虽出现在用户选择器中，但它是共享产品常量，不能被误报为 owner 数据。
- 单条定义字段有界不代表完整条目有界；任何包含无上限 revision history 的聚合都必须继续分层。
- 嵌套来源的错误必须能直接拥有根事务。如果只依外层 JSON 稍后调用 `cancel()`，通用 collection `finally` 可能先拒绝收据并覆盖最具体的失败。
- 非部分导出索引不能用活动列表的 partial index 替代，因为隐私保管必须包含已归档条目。
- 只保存末 UUID 的游标仍能避免 JavaScript 时间精度损失：完整排序元组由同一快照中的 owner-scoped 锚点子查询恢复。
- 四字段完成不等于完整归档完成；food catalog、workout 同根连接、后续集合、媒体和执行保管链仍是独立门禁。

## 6. 全局状态、项目反思与下一步

本轮首次把 owner 动作目录与同意、健康当前和健康修订固定在同一事实时刻，并在不聚合 history 的前提下保持同步 v4 字节。它同时澄清了 starter 的非用户数据边界，并补齐归档条目的全历史索引。公开同步导出仍完整组装，workout 也仍在独立事务，所以 R-013 只获得结构性缓解，继续保持中等级开放。

Inspect → Rank → Improve → Validate 的下一步是以相同标准审计 `foodCatalog`：确认 owner/内置参考目录边界，拆分无上限 history，固定 `(created_at,id)` 与 revision keyset、索引、对象键序、64 KiB 和最深层取消，再作为第五字段加入同一协调根。workouts 必须继续位于 food catalog 之后，不能跨事务拼接。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 170 轮档案](170-portable-export-workout-lazy-json-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0165](../architecture/decisions/0165-portable-export-exercise-catalog-coordinated-source.md)
