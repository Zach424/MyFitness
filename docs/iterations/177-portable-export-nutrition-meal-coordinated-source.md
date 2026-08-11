# 第 177 轮：便携归档餐食第七协调字段

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把第 175–176 轮已验证的完整餐食数据库会话和递归 JSON 数组作为第七字段注入现有六字段协调根。验收标准为：复用同一 `PoolClient` 与一次 active-owner 校验；不复制餐食状态机；前六字段结束后的并发餐食新增不可见；完整七字段 eager/lazy v4 逐字节相同；活动 revision snapshot item 早停时，JSON、协调和数据库来源共享同一最深错误。

本轮不修改旧六字段入口、独立餐食入口或同步公开下载，也不增加迁移、KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增七字段会话/收据类型与 `createConsentHealthCatalogWorkoutNutritionSnapshot()`。
  - 为餐食状态机增加内部 `accountAlreadyValidated/failRoot` 上下文；独立入口默认行为不变。
  - 新增协调餐食行工厂，以当前 `PoolClient` 调用原餐食状态机，不拥有第二事务。
  - 把 meal、当前 item、revision、revision snapshot 根和 snapshot item 五段统计并入统一收据。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.ts`
  - 新增七字段 JSON 来源，组合现有目录、workout 与 `createPortableExportNutritionMealJsonArray()`。
  - receipt、complete 和 cancel 直接透传协调根。
- 单元测试
  - 证明一个事务流和一次 owner 查询贯穿第七字段。
  - 证明 nutritionMeals 位于 workouts 之后，完整递归字段按同步字节输出。
- PostgreSQL 集成测试
  - 证明根事务开始后、前六字段结束时新增的餐食对第七字段不可见。
  - 证明完整七字段 53 字节分块与 eager v4 逐字节相同，并核对五段餐食收据。
  - 证明活动历史 snapshot item 早停统一三个失败观察点。
- `docs/architecture/decisions/0171-portable-export-nutrition-meal-coordinated-source.md`
  - 固定单事务注入、旧接口兼容、统一失败所有权和字段总序决策。
- 项目状态、架构、数据库、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 176 轮、ADR-0170、第 173 轮与 ADR-0167，确认 workout 的 `PoolClient` 注入是可复用协调模式。
2. 保留餐食公开独立入口，把跳过 owner 校验和根失败回调放进默认关闭的内部上下文。
3. 用当前 client 构造不拥有事务的 `DatabaseService` 适配器，再调用原餐食会话并等待其收据；只在完整结束后合并统计。
4. 在描述列表末尾追加 `nutritionMeals`，不改变前六个字段定义、顺序或 API。
5. 在 JSON 层组合第 176 轮公开的 `createPortableExportNutritionMealJsonArray()`，不重新包装数据库生命周期。
6. 用内存替身核对 streamCount/accountQueries，并用一餐的当前及历史条目核对七字段递归字节。
7. 用真实数据库先启动七字段根、消费前六字段，再插入同 owner 餐食，证明 repeatable-read 快照不可见性。
8. 分别物化 eager 七字段与流式 lazy 七字段，按完整 Buffer 对账并核对五段餐食行数。
9. 在一字节 JSON 流中等待同一 item UUID 第二次出现，确认已进入 revision snapshot items 后提前关闭并比对三个错误引用。
10. 先跑专项单元、API typecheck 和目标 PostgreSQL 文件，再运行全仓单元、串行集成、类型、构建与生产依赖审计。

## 4. 验证证据

- 目标单元测试：2 个文件、51/51 项通过；七字段 JSON 文件新增 1 项，完整单元总量增加到 567。
- 目标真实 PostgreSQL：同文件 49/49 项通过，其中新增七字段稳定/字节与最深取消 2 项。
- 完整单元测试：101 个文件、567/567 项通过。
- 完整集成测试：23 个文件、126/126 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 单元替身收据证明 `streamCount: 1`、`accountQueries: 1`，餐食空字段仍在同一根完成。
- 真实快照在前六字段结束后插入第二餐，第七字段只返回根事务开始时存在的第一餐。
- 完整七字段以 53 字节块输出，与 eager v4 Buffer 相同；两餐收据为 meal 2、当前 item 4、revision 2、snapshot 根 2、snapshot item 4。
- 活动 revision snapshot item 早停时，迭代器返回失败、JSON 收据与协调数据库收据引用同一错误，错误固定为最深条目未完整消费。
- 第一次完整集成发现新测试错误地把同时间戳餐食的创建先后当作总序；改为按 UUID 尾序比较后，目标文件 49/49 与第二次完整串行 126/126 均通过。一次既有索引计划断言曾选择另一可用索引，未修改产品代码，后续目标与完整复跑均通过。
- 中文文档、格式与迁移索引门禁通过，`docs/` 共 377 份 Markdown，第 090–177 轮 88 份、ADR-0085–0171 87 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：68,434 bytes，SHA-256 `1918831a7c6072c54b0dafa185361d31a627b30ef5652b7b7b98a2c259b2568a`。

## 5. 发现的问题与经验

- 嵌套状态机接入协调根只需要两个能力：确认 owner 已验证，以及把最深失败提升到父根。事务开始、提交和回滚权不应进入子适配器。
- 等待子会话收据时要先安装成功/失败分支，避免迭代期间的拒绝成为未处理 Promise；完整结束后再合并统计，不能发布半完成收据。
- 旧入口兼容比直接扩展原六字段类型更安全。新增七字段方法允许既有调用方保持原消费终点，也让本轮回滚面保持清晰。
- 创建顺序不等于数据库总序。相同 `occurred_at/created_at` 的餐食必须按 UUID 排序，集成断言也必须复现该契约。
- 查询计划是优化器选择而不是产品事实；既有索引命中测试可能受统计信息影响。本轮没有放宽该门禁，但把首次失败和独立复跑如实记录，避免把一次偶然结果当作稳定证据。
- 最深取消测试必须等到同一 item UUID 第二次出现，才能区分当前 items 与不可变历史 items，并证明错误确实由历史叶提升到协调根。
- 这一轮没有改变营养事实、用户记录或建议逻辑。第七字段只提高导出一致性和有界传输能力。

## 6. 全局状态、项目反思与下一步

本轮完成了异步便携归档前七个 v4 集合的一致性闭环：它们共享一个 active-owner、只读 repeatable-read 事实时刻，一个根生命周期和一个最深错误权威；完整 workouts 与 nutritionMeals 都保持递归背压，不在 Node 中聚合无界对象图。

Inspect → Rank → Improve → Validate 的下一步是审计紧随餐食的 `nutritionFavorites`。必须先固定 owner 与软删除范围、同步字段顺序、稳定 keyset、现有索引、最大合法单元素字节和并发可见性，再决定它能否作为简单第八字段，不能凭对象看似较小直接接入。同步公开下载、真实 KMS、云存储、租约执行器、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 176 轮档案](176-portable-export-nutrition-meal-lazy-json-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [营养记录模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0171](../architecture/decisions/0171-portable-export-nutrition-meal-coordinated-source.md)
