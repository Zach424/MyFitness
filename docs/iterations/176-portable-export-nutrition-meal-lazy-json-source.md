# 第 176 轮：便携归档餐食递归懒 JSON 来源

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把第 175 轮独立餐食数据库会话适配为递归 `nutritionMeals` JSON 字节源。验收标准为：创建后不预取；meal 当前 items、history 和 revision snapshot items 按 PostgreSQL JSONB 键序原位包装；完整 eager/lazy v4 逐字节相同；活动最深历史 item 早停时，JSON 与数据库收据共享同一错误。

本轮不接入六字段协调根、不修改同步公开下载，也不增加迁移、KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-nutrition-meal-json-source.ts`
  - 新增 `createPortableExportNutritionMealJsonSource()` 与独立来源会话类型。
  - meal 到达时原位替换 `items/history` 空数组；revision 到达时原位替换 `snapshot.items` 异步来源。
  - 三段嵌套数组都使用现有私有 `PortableExportJsonAsyncArray`，不扩大普通 iterable 的可信边界。
  - 完成、取消和收据直接委托给原数据库会话，不创建第二事务或提交权威。
- `apps/api/src/privacy/portable-export-nutrition-meal-json-source.test.ts`
  - 增加零预取、字段遍历、完整字节等价和最深条目关闭顺序两项单元验证。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 增加完整真实餐食 31 字节分块等价，以及活动不可变条目早停同根取消两项 PostgreSQL 验证。
- `docs/architecture/decisions/0170-portable-export-nutrition-meal-lazy-json-source.md`
  - 固定原位包装、私有节点、零预取、单一生命周期和分轮协调决策。
- 项目状态、架构、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 175 轮、ADR-0169 与训练懒 JSON 的 ADR-0164，分离可复用适配模式和餐食自有字段顺序。
2. 保持数据库会话输出类型不变，在单独文件中只做占位字段检查和私有懒节点替换。
3. meal 生成器先包装当前 items，再包装 history；history 生成器只在 revision 被请求时包装 `snapshot.items`。
4. 将原会话的 receipt、complete 与 cancel 直接透传，使 JSON 编码器继续拥有唯一根生命周期。
5. 用内存生成器记录实际拉取顺序，并在创建来源和创建 JSON 流后立即断言没有数据库正文被请求。
6. 用真实数据库生成一餐、两个当前条目和两份完整修订，分别走同步 JSONB 与懒 JSON，并按完整字节对账。
7. 在一字节分块流中等待同一条目 UUID 第二次出现，以确认编码器已进入历史 snapshot item，再提前关闭并核对三个失败观察点。
8. 先跑新单元、API 类型和两项 PostgreSQL 专项，再运行全仓单元、集成、类型、构建与生产依赖审计。

## 4. 验证证据

- 新增单元测试：2/2 项通过，证明创建后零预取、`items→history→snapshot.items` 遍历、字节等价和先关闭最深条目。
- 目标真实 PostgreSQL：2/2 项通过；同文件其余 45 项在专项阶段跳过。
- 完整单元测试：101 个文件、566/566 项通过。
- 完整集成测试：23 个文件、124/124 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库以 31 字节上限逐块输出，完整 `nutritionMeals` 与同步 v4 JSONB 投影逐字节相同。
- 完成流后五段数据库收据为 meal 1、当前 item 2、revision 2、snapshot 根 2、snapshot item 4，JSON SHA-256 与 eager 正文一致。
- 活动历史 snapshot item 早停时，迭代器返回失败、JSON 收据与数据库收据引用同一错误，错误固定为最深条目未完整消费。
- 中文文档、格式与迁移索引门禁通过，`docs/` 共 375 份 Markdown，第 090–176 轮 87 份、ADR-0085–0170 86 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：68,815 bytes，SHA-256 `1e4b45a14fe5ba222c52d6ad574e1116fb9c566db208b4e567b8b97fa0ff74ac`。

## 5. 发现的问题与经验

- 递归适配器不需要理解数据库分页，只需要保护占位字段身份、延迟访问和根生命周期；越少复制底层规则，越容易保持一个错误权威。
- 原位赋值已有对象属性不会改变 JavaScript 枚举顺序，这使 PostgreSQL JSONB 骨架可以同时承担结构断言和字节兼容锚点。
- 零预取必须在创建来源后直接观察，而不能只凭最终遍历顺序推断；最终顺序正确并不能排除适配器曾提前读取又缓存正文。
- 相同条目 UUID 同时存在于当前 items 与 revision snapshot items，取消测试必须区分首次和第二次出现，才能证明早停发生在历史叶而不是当前关系层。
- 生命周期透传仍需由增量 JSON 编码器负责先关闭活动子生成器；只有子级清理完成后调用数据库 cancel，最深错误才不会被通用取消错误覆盖。
- 字节等价只证明独立来源的转换正确，不证明跨字段事实一致；第七字段协调仍是独立门禁。
- 这一轮没有改变任何营养事实或用户记录。适配器只改变内部传输形态，不应被描述为饮食分析、完整性评分或健康建议能力。

## 6. 全局状态、项目反思与下一步

本轮把完整餐食从可分层读取的数据库会话推进为现有增量编码器可直接消费的递归 JSON 来源，同时保持零预取、键序、字节和最深取消证据。它消除了接入协调根前最后一个内容转换缺口，但仍不能宣称餐食与前六字段共享同一数据库时刻。

Inspect → Rank → Improve → Validate 的下一步是复用现有 `PoolClient` 和 active-owner 结论，把餐食作为第七字段注入描述驱动协调器。必须证明前六字段结束后的并发餐食新增不可见、七字段 eager/lazy 逐字节相同，以及活动历史 item 早停时统一 JSON/协调/数据库收据同根失败。同步公开下载、真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 175 轮档案](175-portable-export-nutrition-meal-layer-lifecycle.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [营养记录模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0170](../architecture/decisions/0170-portable-export-nutrition-meal-lazy-json-source.md)
