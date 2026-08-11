# 第 172 轮：便携归档食物目录分层协调来源

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把同步 v4 的 `foodCatalog` 建成第五个协调字段。验收标准为：冻结自定义 owner 数据与内置 starter 参考目录的边界；活动和归档条目按稳定 keyset 顺序读取；无上限 history 拆为 revision 子流；条目与修订分别执行 64 KiB 门禁；五字段共享同一 repeatable-read 事实时刻；递归 JSON 与同步投影逐字节相同；任意嵌套取消以最深层错误回滚并拒绝统一收据。

本轮不把 workouts 接入五字段协调器、不修改公开同步下载，也不新增 KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0034_portable_export_food_catalog_index.sql`
  - 新增 `user_food_catalog_entries (user_id,created_at,id)` 非部分索引，覆盖活动与归档条目的全历史导出顺序。
- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增食物条目骨架与 revision 页面查询、两层 keyset、两层 64 KiB 门禁和嵌套 history 生命周期。
  - 新增 `createConsentHealthCatalogSnapshot()`；同意、健康当前、健康修订、动作目录与食物目录共享一个根事务和一次 active owner 校验。
  - 收据新增食物条目与修订的独立批次/行数；复用嵌套根失败回调，保证具体 food history 错误拥有根事务。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.ts`
  - 新增五字段 JSON 适配器，把两个目录的顶层数组和条目 history 递归标记为私有懒数组，并透传同一完成/取消生命周期。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`
  - 新增第五字段顺序/收据和跳过 food history 的失败关闭证明。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.test.ts`
  - 新增食物目录原键位字节等价与活动 history 先关闭后取消根会话证明。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 新增真实 PostgreSQL owner/starter 边界、归档、并发隔离、索引计划、同步/懒字节对账和活动 food history 同根取消。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增迁移 0034 精确 owner 导出索引列序门禁。
- `docs/architecture/decisions/0166-portable-export-food-catalog-coordinated-source.md`
  - 固定 owner/starter、条目/history 分层、营养事实非验证边界、根错误优先和下一字段顺序决策。
- 项目状态、架构、数据库、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读项目状态、第 171 轮和 ADR-0165，把范围冻结为 v4 第五字段，不提前连接 workout。
2. 审计同步查询和食物目录服务，确认导出只读取 `user_food_catalog_entries`，内置 starter 只服务选择器与受控照片候选。
3. 识别 revision 数量无上限，拒绝把完整 history 作为单行；设计含 `history: []` 的条目骨架和独立 revision 子流。
4. 以 `(created_at,id)` 和 revision 建立两层 keyset；新增迁移 0034，history 复用既有 owner/entry/revision 降序索引的反向扫描。
5. 复用 PostgreSQL `octet_length` 门禁和固定无内容错误，让条目与每条修订各自不超过 64 KiB。
6. 把食物目录 row factory 加入描述驱动协调器，保持前四字段接口兼容；最深 food history 错误通过既有嵌套失败回调直接关闭根事务。
7. 原位把食物条目 `history` 替换为私有 JSON 懒数组，五个顶层字段的完成/取消直接委托同一协调会话。
8. 先跑目标替身与适配器测试，再跑真实 PostgreSQL 和完整质量门禁；最后更新中文文档与 Obsidian 并提交。

## 4. 验证证据

- 目标单元测试：3 个文件、70/70 项通过。
- 目标真实 PostgreSQL 文件：37/37 项串行通过。
- 完整单元测试：100 个文件、561/561 项通过。
- 完整集成测试：23 个文件、114/114 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库证明活动和归档 owner 食物条目均输出，其他 owner 与 starter 不输出；前四字段结束后新增的食物条目对已打开快照不可见。
- `EXPLAIN` 在关闭顺序扫描时命中 `user_food_catalog_entries_user_export_idx`。
- 完整五字段以 43 字节块增量编码，与同步 v4 `foodCatalog` 聚合逐字节相同。
- 食物条目和 revision 收据独立计数；条目不泄漏 `user_id`、`idempotency_key` 或 `request_hash`。
- 活动 food history 中止时，history 未完成错误先关闭根事务，迭代返回、JSON 收据和数据库收据引用同一错误。
- 本轮新增迁移 0034；中文文档、格式与迁移索引门禁通过，`docs/` 共 367 份 Markdown，第 090–172 轮 83 份、ADR-0085–0166 82 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像写入并逐字节验证通过：69,057 字节，SHA-256 `868148fec6e77a3c90142fb97e3ae21d5a0b3cb884fda16fca8a7e955796c1f8`。

## 5. 发现的问题与经验

- 食物选择器目录不等于隐私导出边界。starter 虽出现在用户界面并为照片候选提供受控键，但它是共享产品常量，不能被误报为 owner 数据。
- “用户确认 reference”只描述来源凭据，不等于验证营养准确性；隐私导出完成不能升级为医学、实验室或提供方背书。
- 食物定义字段有界仍不代表完整条目有界；不可变 revision history 必须继续分层并独立计数。
- 活动列表的 partial index 不能服务隐私全历史导出，因为已归档定义仍属于保管、纠正和擦除范围。
- 动作与食物目录共享同一种条目/history 状态机后，新增目录字段只需提供独立查询与收据；但类型仍分别命名，避免未来两个聚合的字段约束被错误耦合。
- 五字段完成不等于完整归档完成；workout 同根连接、后续集合、媒体和执行保管链仍是独立门禁。

## 6. 全局状态、项目反思与下一步

本轮首次把 owner 食物目录与同意、健康当前、健康修订和动作目录固定在同一事实时刻，并在不聚合 history 的前提下保持同步 v4 字节。它同时澄清了 starter 与用户确认营养事实的边界，并补齐归档食物的全历史索引。公开同步导出仍完整组装，workout 也仍在独立事务，所以 R-013 只获得结构性缓解，继续保持中等级开放。

Inspect → Rank → Improve → Validate 的下一步是把已经证明完整的七层 workout JSON 来源连接为第六个协调字段。实现必须让 workout row factory 复用现有协调器的 `PoolClient`、owner 校验、快照和根错误，不得打开第二个事务；同时保持 PostgreSQL JSONB 的 `history→exercises` 键序、全部层级 keyset、64 KiB 和最深层取消。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 171 轮档案](171-portable-export-exercise-catalog-coordinated-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [营养模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0166](../architecture/decisions/0166-portable-export-food-catalog-coordinated-source.md)
