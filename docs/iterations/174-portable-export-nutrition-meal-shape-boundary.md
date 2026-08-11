# 第 174 轮：便携归档餐食形状与历史聚合边界

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只固定 `nutritionMeals` 的顶层总序、全历史 owner 索引和无正文边界审计。验收标准为：同步餐食顺序补 UUID 尾键；索引覆盖软删除保管范围并被真实计划使用；合法最大条目餐食能复现无上限 history 越过 64 KiB；shape 收据只含计数、字节数与布尔，不含标识或正文；跨 owner 失败关闭。

本轮不输出餐食正文、不实现第七协调字段、不修改公开同步下载，也不新增 KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增版本化 `PortableExportNutritionMealShapeReceipt`、无聚合 shape SQL 与 `inspectNutritionMealShape()`。
  - 分别测量 meal 空数组骨架、当前 item payload、revision payload 总量/最大值与 snapshot items 形状；结果不含 UUID 或正文。
- `apps/api/src/privacy/privacy.service.ts`
  - 同步 v4 餐食顶层顺序从 `(occurred_at,created_at)` 补为 `(occurred_at,created_at,id)`。
- `infra/postgres/migrations/0035_portable_export_nutrition_meal_index.sql`
  - 新增覆盖活动与软删除记录的非部分 `(user_id,occurred_at,created_at,id)` 索引。
- 数据库漂移与便携归档真实 PostgreSQL 测试
  - 用契约合法的 30-item、4-revision 餐食固定历史超限反例、无正文收据、跨 owner not-found 和索引计划命中。
- `docs/architecture/decisions/0168-portable-export-nutrition-meal-shape-boundary.md`
  - 固定稳定总序、无正文审计、禁止截断历史和后续四层来源决策。
- 项目状态、架构、数据库、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 173 轮与 ADR-0167，把范围冻结为餐食边界证据，不提前实现正文流。
2. 审计共享契约、迁移与营养服务，确认请求最多 30 items，但每次修订都持久化完整 `Meal` snapshot 且数量无上限。
3. 补齐同步顶层 UUID 总序，并为全历史 owner 读取新增非部分索引；保留现有当前列表部分降序索引。
4. 用 target、item stats 和 revision stats 三个 PostgreSQL CTE 逐组件计数及测量，不执行 `jsonb_agg(history)`。
5. 把收据限制为 revision、count、byte size 和 shape boolean；不映射任何 owner/meal UUID 或正文。
6. 构造经过共享 `mealSchema` 验证的 30-item、4-revision 真实数据库夹具，证明聚合风险与单组件可分层性同时成立。
7. 先跑 shape 专项和迁移单元，再跑完整门禁；最后更新中文文档与 Obsidian 并提交。

## 4. 验证证据

- 目标单元测试：2 个文件、68/68 项通过。
- 目标真实 PostgreSQL：1/1 项通过；shape 文件其余 39 项在专项阶段跳过。
- 完整单元测试：100 个文件、564/564 项通过。
- 完整集成测试：23 个文件、117/117 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库证明 30 个当前 item 的总 payload 低于 64 KiB，4 份完整 revision 的 payload 总量高于 64 KiB，每份 revision 仍低于 64 KiB。
- shape 收据不含 secret marker、owner UUID 或 meal UUID；其他 owner 只得到固定 `nutrition meal not found`。
- `nutrition_meals_user_export_idx` 无 predicate，并被禁用顺序扫描的真实导出排序计划命中。
- 中文文档、格式与迁移索引门禁通过，`docs/` 共 371 份 Markdown，第 090–174 轮 85 份、ADR-0085–0168 84 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像写入并逐字节验证通过：68,923 字节，SHA-256 `f5c39a5c8ed46908ae8d72c3fe9abd8f142e57f7320fb5a72e2cf8cc58169e2b`。

## 5. 发现的问题与经验

- “每餐最多 30 项”只限制当前横截面，不能限制完整修订历史；长期证据规模必须同时审计横向条目与纵向修订。
- 无正文 shape 收据应求和逐行字节，而不是为证明聚合风险先执行一次同样危险的 JSON 聚合。
- 单 revision 当前低于 64 KiB 只证明本夹具可分层；后续仍必须把 snapshot items 拆开，防止未来契约或历史形状变化让单份快照越界。
- 导出索引不能复用只覆盖 `deleted_at IS NULL` 的列表索引；便携归档必须保留软删除证据。
- UUID 尾键既是稳定呈现要求，也是未来 keyset 不重不漏的前置条件。
- 边界审计不应被解释为营养事实验证、身体分析或饮食建议。

## 6. 全局状态、项目反思与下一步

本轮没有增加用户可见功能，却把最容易被错误复制的餐食聚合查询转化为可复现反例。项目现在知道 `nutritionMeals` 不能作为简单第七行源，也拥有稳定总序和索引基础；但正文尚未迁移，所以 R-013 风险等级不变。

Inspect → Rank → Improve → Validate 的下一步是实现独立餐食四层数据库会话：meal 骨架按三元 keyset、当前 items 按 position、history 头按 revision、revision snapshot items 按 JSON ordinality。每层需要 64 KiB 门禁、一次性完整消费、显式提交、最深层取消与 eager 字节等价；验证完成后才接入第七协调字段。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 173 轮档案](173-portable-export-workout-coordinated-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [营养记录模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0168](../architecture/decisions/0168-portable-export-nutrition-meal-shape-boundary.md)
