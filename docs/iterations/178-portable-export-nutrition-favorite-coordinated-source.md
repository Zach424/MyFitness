# 第 178 轮：便携归档营养收藏第八协调字段

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只审计并实现同步 v4 中紧随 nutritionMeals 的当前 owner `nutritionFavorites`，在确认删除语义、同步十四字段键序、最大合法行、稳定 keyset 和现有索引后，把它作为第八字段接入既有七字段协调根。验收标准为：只导出当前 owner 行；复用 `(user_id,food_key)` 复合主键且不增加迁移；逐行执行 64 KiB 门禁；根开始后的并发收藏不可见；完整八字段 eager/lazy v4 逐字节相同；活动收藏早停时迭代器、JSON 与数据库收据共享同一根错误。

本轮不修改既有七字段入口、同步公开下载、收藏业务路由或客户端，也不增加云服务、KMS、租约执行器、下载授权。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增独立收藏会话/收据、`createNutritionFavoriteSnapshot()` 和第八字段协调入口。
  - 收藏精确选择同步十四字段，按 `food_key` keyset，并复用现有复合主键。
  - 通用有界 payload 解析支持显式身份键，收藏不向 JSON 注入伪造 `id`。
  - 修复描述驱动协调器普通字段提前返回未抛根错误的生命周期缺口。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.ts`
  - 新增八字段 JSON 来源，把 nutritionFavorites 作为普通私有懒数组接入同一根生命周期。
  - 继续复用两个目录、workout 和 nutritionMeals 的既有递归适配器。
- 单元测试
  - 证明一个事务流和一次 owner 查询贯穿第八字段，空收藏收据正确完成。
  - 证明 nutritionFavorites 位于 nutritionMeals 之后，完整字段顺序与同步正文一致。
- PostgreSQL 集成测试
  - 证明最大合法收藏行、门禁前一字节拒绝、跨 owner 排除、复合主键总序与实际查询计划。
  - 证明根事务开始后的并发收藏不可见，完整八字段 43 字节分块与 eager v4 逐字节相同。
  - 证明活动收藏早停在三个观察点共享根错误。
- `docs/architecture/decisions/0172-portable-export-nutrition-favorite-coordinated-source.md`
  - 固定当前快照语义、主键 keyset、身份键门禁和普通数组失败所有权。
- 项目状态、架构、数据库、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 177 轮与 ADR-0171，并审计同步隐私导出查询、迁移 0005 和收藏业务删除路径。
2. 确认表中不存在软删除或 history，取消收藏使用物理删除，因此只迁移当前 owner 快照。
3. 核对同步查询的十四字段和 `food_key` 顺序，确认复合主键已覆盖查询前缀与唯一锚点。
4. 扩展有界 payload 工厂，使调用方可以指定内部身份键；默认仍为 `id`，收藏使用 `food_key`。
5. 先实现独立收藏快照，再把相同行工厂追加到第八字段协调定义，保留原七字段入口。
6. 在 JSON 层把收藏挂成普通懒数组，不改变既有嵌套字段适配器或根收据。
7. 用合法最大字符串/数值夹具测量真实 PostgreSQL payload，随后把门禁设为精确少一字节，证明正文不泄露。
8. 在完整前七字段读取后插入并发收藏，证明根 repeatable-read 快照仍只返回启动前行。
9. 以 43 字节块对账完整八字段 Buffer，并在收藏正文已活动时提前关闭迭代器。
10. 首次取消测试发现协调迭代器可正常返回；修复通用协调器的未完成退出判断后，三个失败观察点共享已登记根错误。
11. 运行专项单元、API typecheck 和目标 PostgreSQL 文件，再运行全仓单元、串行集成、类型、构建与生产依赖审计。

## 4. 验证证据

- 目标单元测试：2 个文件、52/52 项通过；完整单元总量增加到 101 个文件、568/568 项。
- 目标真实 PostgreSQL：同文件 52/52 项通过，其中新增收藏边界、第八字段一致性和同根取消 3 项。
- 完整集成测试：23 个文件、129/129 项串行通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- 最大合法十四字段收藏行低于 64 KiB；门禁设为正文精确少一字节时，在交付任何 payload 前拒绝。
- 真实数据库证明其他 owner 收藏不可见、`food_key` 升序稳定，实际计划命中 `(user_id,food_key)` 复合主键。
- 第八字段只看见协调根启动前的收藏；根启动后的同 owner 新增不可见。
- 完整八字段以 43 字节块输出，与同步 eager v4 Buffer 相同。
- 活动收藏早停时，迭代器返回、JSON 收据与协调数据库收据引用同一个根错误。
- 中文文档、格式与迁移索引门禁通过；`docs/` 共 379 份 Markdown，第 090–178 轮 89 份、ADR-0085–0172 88 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：68,586 bytes，SHA-256 `27af80d436187264ff6e0636ed094b620b81cc67ade009968ba94c1bdadc1760`。

## 5. 发现的问题与经验

- 主键不是只用于去重。`(user_id,food_key)` 恰好对应 owner 范围和字段总序时，它同时是最小的 keyset 索引；新增“导出专用”索引反而会制造冗余。
- 当前快照模型不能伪造历史。取消收藏已物理删除，本轮只能诚实导出现存行；若未来需要审计轨迹，必须先形成明确产品与保留决策，再设计独立事件模型。
- 通用行解析不能假定每个公开对象都有 `id`。让身份键成为内部参数既保留统一重复检测，也避免污染用户可见契约。
- 嵌套取消已经正确不代表普通数组取消也正确。普通字段的 `return()` 路径首次触发了“数据库收据失败、JSON 层二次失败”的分叉；协调器必须在任何未到边界退出时抛出根错误。
- 最大合法行必须用真实 SQL 编码测量。仅从 TypeScript 字符长度推算会漏掉 JSON 转义、数值和时间格式成本。
- 本轮没有改变收藏内容、营养事实或建议逻辑。第八字段只提高导出一致性、有界性和取消可解释性。

## 6. 全局状态、项目反思与下一步

本轮完成了同步 v4 前八个顶层集合的异步一致性闭环：它们共享一个 active-owner、只读 repeatable-read 事实时刻，一个根生命周期和一个错误权威。nutritionFavorites 证明普通字符串主键数组可以在不改变公开对象形状、不新增索引的前提下复用同一协调框架。

Inspect → Rank → Improve → Validate 的下一步是审计同步 v4 的 `weeklyPlans`。必须固定 owner 与软删除范围、顶层总序、history、sessions 和 workout_links 的键序与基数边界，测量最大合法计划及无界修订/关联总量，并核对现有索引。它含多层嵌套，必须先判断是否像 workouts/nutritionMeals 一样分层，不能直接复制同步 `jsonb_agg`。同步公开下载、真实 KMS、云存储、租约执行器、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 177 轮档案](177-portable-export-nutrition-meal-coordinated-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [营养记录模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0172](../architecture/decisions/0172-portable-export-nutrition-favorite-coordinated-source.md)
