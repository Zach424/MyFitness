# 第 179 轮：便携归档周计划形状与关联总序边界

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只审计同步 v4 `weeklyPlans` 的 owner/删除边界、顶层和子集合总序、合法最大结构、无界 history/links/reflections 与现有索引，并实现不返回正文的 shape 收据。验收标准为：共享 Schema 合法最大结构证明当前 payload 与单 revision 是否越过 64 KiB；聚合 history 与已关闭 links 有可复现超限反例；同步 links 获得 UUID 尾序和实际命中的全历史索引；收据不泄露账号、计划标识或正文。

本轮不输出 weeklyPlans 正文，不实现递归计划来源或第九协调字段，也不修改公开同步下载、客户端、KMS、租约执行器或下载授权。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增 `myfitness-portable-export-weekly-plan-shape/v1` 收据、SQL 和 `inspectWeeklyPlanShape()`。
  - 统计计划头、当前 payload/最大 day/evidence、history/最大 revision/最大 day/evidence、links 和 reflections 的字节与计数。
  - 检查当前与全部 revision snapshot 的四个预期内容节点，不返回正文或 UUID。
- `apps/api/src/privacy/privacy.service.ts`
  - 同步 link 排序从 `linked_at` 补为 `(linked_at,id)`，不改变字段集合。
- `infra/postgres/migrations/0036_portable_export_plan_workout_link_index.sql`
  - 新增 `(user_id,plan_id,linked_at,id)` 非部分索引，覆盖活动与已关闭关系。
- `apps/api/src/database/schema-drift.test.ts`
  - 锁定迁移文件与精确索引列顺序。
- PostgreSQL 集成测试
  - 用共享 Schema 解析 7×8×6 合法计划并插入四条完整 history、400 条同时间已关闭 link、四条体验反思。
  - 证明超限关系、跨 owner 隐藏、无正文收据、UUID 总序、索引定义与实际计划命中。
- `docs/architecture/decisions/0173-portable-export-weekly-plan-shape-boundary.md`
  - 固定周计划必须递归分层、关闭关系必须保留和 link UUID 尾序决策。
- 项目状态、架构、数据库、计划模型、隐私所有权、路线图与 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 178 轮、ADR-0172、计划模型、同步隐私查询和迁移 0006/0022/0028。
2. 确认 weekly_plans 不软删除；history 不可变；links 关闭而不删除；reflection 每计划修订最多一条当前值。
3. 对照唯一约束核对顺序，发现 link 的 `linked_at` 不唯一，补 UUID 尾序并设计非部分全历史索引。
4. 设计只返回数值和布尔的 shape 查询：所有正文只在 PostgreSQL 内计算 `octet_length`，Node 不接收 JSON payload。
5. 通过 `weeklyPlanSchema.parse()` 构造最大 days/activity/options 基数与最大有界文本，保证超限反例来自共享产品契约而非任意数据库 JSON。
6. 让四条 revision 保存同一合法完整 snapshot；用 `generate_series` 创建 400 条同时间已关闭 link，证明聚合量和时间碰撞。
7. 同时测量空 payload 头、最大单日、evidence、单 link 与单 reflection，确定下一轮的最小分层方向。
8. 读取 `pg_index` 并对未来生产形状查询执行 `EXPLAIN (FORMAT JSON)`，证明迁移 0036 无谓词且实际命中。
9. 先跑 API typecheck、schema drift 和目标 PostgreSQL，再运行全仓单元、串行集成、strict 类型、构建与生产依赖审计。

## 4. 验证证据

- API strict typecheck 通过。
- 目标 schema drift：1 个文件、24/24 项通过。
- 目标真实 PostgreSQL：1 个文件、53/53 项通过；新增周计划 shape/总序/索引 1 项。
- 完整单元测试：101 个文件、569/569 项通过。
- 完整集成测试：23 个文件、130/130 项串行通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- 合法当前 payload 与单 revision 均超过 64 KiB；四条 history 和 400 条 closed links 聚合也超过门禁，时间戳碰撞数为 399。
- 空 payload 头、最大单日、evidence、单 link 与单 reflection 在边界夹具中低于 64 KiB。
- shape 收据不含 secret marker、owner UUID 或 plan UUID；其他 owner 读取返回 `weekly plan not found`。
- 同时间 link 按 UUID 尾序稳定；迁移 0036 索引无谓词、列序精确，实际查询计划命中。
- 首次格式命令包含 SQL 文件，Prettier 因仓库未配置 SQL parser 报告无法推断；SQL 保持原生两行迁移格式，TypeScript/Markdown 随后使用受支持格式器独立验证。这不是产品或测试失败。
- 中文文档与迁移索引门禁通过；`docs/` 共 381 份 Markdown，第 090–179 轮 90 份、ADR-0085–0173 89 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：69,333 bytes，SHA-256 `ce0dfbb27dab2b6de67f73fb898ee1c13ea95a23be45c405fe448003ef7a82cc`。

## 5. 发现的问题与经验

- 数据库 JSONB 约束为对象，不等于业务结构合法；边界反例必须先通过共享 Schema，才能支持“合法数据会被错误拒绝”的结论。
- 单个计划不是天然小对象。数组每层都有上限，但 7×8×6 的乘积足以让当前 payload 和每条完整 revision 超过 64 KiB。
- 只解决历史聚合不够：当前 payload 已超限，current 与 revision 必须共享同一套递归内容适配器，避免两套键序和兼容规则。
- 部分唯一索引只证明活动关联冲突，不服务包含关闭行的 owner 导出。全历史 keyset 必须使用非部分索引。
- 时间字段不是自动总序。已关闭关联可以同毫秒写入，`linked_at` 必须附加 UUID 才能稳定分页和逐字节复现。
- shape 收据只能证明结构风险和分解方向，不是正文来源，也不能被描述成 weeklyPlans 已迁移。
- 本轮没有改变计划生成、采纳、关联语义或健康建议；只固定隐私导出结构与顺序。

这次审计还说明，边界设计不能只看一条示例记录的大小。计划的每一层分别有数量上限，但上限相乘后仍可能形成很大的合法对象；历史和已关闭关系又会随使用时间持续增长。安全实现必须同时控制单个叶节点、每一层遍历顺序、父子生命周期和整个账号交付上限。任何一层提前结束都应关闭同一只读事务，任何统计收据都只能保留不含身份和正文的聚合证据。这样的分解虽然步骤更多，却能让后续实现逐层验证、逐层回滚，并避免为了赶进度而截断用户历史。

## 6. 全局状态、项目反思与下一步

本轮没有增加第九字段，而是取得阻止错误实现所需的可复现反例：合法周计划不能作为普通 64 KiB 行，history 与 closed links 也不能整体聚合。同步 links 现在具备稳定表示和全历史索引，后续分层不再依赖不唯一时间锚点。

Inspect → Rank → Improve → Validate 的下一步是先实现 current payload 与单 revision snapshot 共用的递归内容来源。必须保持 PostgreSQL JSONB 原键序，逐层处理 days/session/activities/options、nutritionFocuses、reasons、evidence，并明确旧版 snapshot 与潜在长标量的失败/兼容规则；先证明单计划和单 snapshot 逐字节相同及最深 option 取消，再接 history/links/reflections 和第九协调字段。同步公开下载、真实 KMS、云存储、租约执行器、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 178 轮档案](178-portable-export-nutrition-favorite-coordinated-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [周计划模型](../architecture/PLAN_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0173](../architecture/decisions/0173-portable-export-weekly-plan-shape-boundary.md)
