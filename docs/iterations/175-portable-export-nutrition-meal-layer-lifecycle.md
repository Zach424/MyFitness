# 第 175 轮：便携归档餐食四层正文生命周期

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只实现独立 `nutritionMeals` 四层数据库会话。验收标准为：全历史 meal 在一个 owner 快照内按三元 keyset；当前 items、history 与 revision snapshot items 分层有序；五类 payload 都有 64 KiB 门禁；完整物化值与同步 v4 逐字节相同；字段乱序、非法 snapshot、超限叶和最深层取消失败关闭同一根。

本轮不实现递归餐食 JSON 适配器、不接入第七协调字段、不修改公开同步下载，也不新增 KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增餐食四层值类型、五段收据、固定不可分解错误与 `createNutritionMealLayerSnapshot()`。
  - meal 头按 `(occurred_at,created_at,id)`，当前 items 按 position，history 按 revision，snapshot items 按 JSON ordinality 做 keyset/序数分页。
  - PostgreSQL 分别交付 meal 双空数组、revision 空 snapshot 和 snapshot 空 items 骨架；五类 payload 独立执行 64 KiB 门禁。
  - 状态机要求一次性按 `items→history→snapshot.items` 完整消费，并优先关闭最深活动子流。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 增加同步字节等价/并发隔离、索引命中、最深取消、字段乱序、非法形状和超限叶五项真实数据库验证。
- `docs/architecture/decisions/0169-portable-export-nutrition-meal-layer-lifecycle.md`
  - 固定 JSONB 键序、ordinality 权威、五层门禁、失败所有权和分轮接入决策。
- 项目状态、架构、数据库、营养模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 174 轮与 ADR-0168，确认同步 JSONB 的 meal 键序为 `items` 先于 `history`。
2. 分别建立 meal、当前 item、revision 头、snapshot 根和 snapshot item SQL；每个查询在编码正文后先用 `octet_length` 门禁。
3. 顶层/关系/修订复用稳定 UUID/position/revision 锚点；snapshot items 使用只在查询内部流转的 ordinality 数字锚点，避免重排不可变数组。
4. 让数据库生成空数组或空 snapshot 骨架，Node 仅更新现有键，保持同步 JSONB 的对象键序。
5. 用嵌套异步状态机记录活动 current item、history 和 snapshot item；父级清理先使子级静默退出，再统一提升最深错误。
6. 用共享 `mealSchema` 构造两条目/两修订和上限夹具，在事务中插入并发 meal，逐字段物化后与同步 SQL 投影按 `JSON.stringify` 对账。
7. 增加非法 `items: {}` snapshot 和带 secret marker 的超限叶，证明错误在正文跨边界前发生。
8. 先跑五项真实 PostgreSQL 专项，再跑完整门禁；最后更新中文文档与 Obsidian 并提交。

## 4. 验证证据

- 目标真实 PostgreSQL：5/5 项通过；同文件其余 40 项在专项阶段跳过。
- 完整单元测试：100 个文件、564/564 项通过。
- 完整集成测试：23 个文件、122/122 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库证明同时间 meal 依 UUID 稳定、其他 owner 被排除、事务开始后的并发 meal 不可见；新会话重新开始后可见。
- 当前 item position 与 revision 查询计划分别命中既有唯一索引/owner 索引；snapshot items 保持 JSON ordinality。
- 完整 meal/current items/history/snapshot items 物化结果与同步 v4 JSONB 投影逐字节相同。
- 非数组 snapshot 在正文前返回固定不可分解码；8 KiB secret 叶在 4 KiB 门禁内被 PostgreSQL 扣留，错误和收据不含 marker。
- 活动 snapshot item 取消时，叶与 history 关闭，meal 根下一步和数据库收据由同一 cancellation 错误拒绝。
- 中文文档、格式与迁移索引门禁通过，`docs/` 共 373 份 Markdown，第 090–175 轮 86 份、ADR-0085–0169 85 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：69,008 bytes，SHA-256 `f6125230d94f1c81103423a38152058d31e7617ddbdfba522884883022ee8a17`。

## 5. 发现的问题与经验

- JSONB 对象键序决定调用顺序：餐食是 `items→history`，不能照搬训练的 `history→exercises` 状态顺序。
- 不可变 JSON 数组应以 ordinality 分页；把 position 当作历史物理锚点会重排或跳过旧证据。
- snapshot 根的 payload `id` 是 meal UUID，而查询目标是 revision UUID；数据库门禁校验必须明确区分内容身份与查找身份。
- PostgreSQL 的 `WITH ORDINALITY` 默认返回 bigint，若运行时需要安全整数锚点，应在 SQL 内显式收窄并在 Node 再验证单调性。
- 父级取消必须先标记根 finalized，再关闭活动子迭代器，避免子级 finally 反向重复失败根。
- 数据库空骨架既保留键位又提供结构断言；Node 更新已有属性不会改变同步对象顺序。
- 完整字节等价不等于跨字段同快照；独立餐食会话仍须经过 JSON 适配和协调注入两道门禁。
- 这一轮再次证明，超大餐食记录不能只在应用层分页：数据库若先返回完整正文，秘密内容已经越过边界，后续检查再严格也无法撤销暴露。先在数据库计算编码字节数，再决定是否交付，才能让上限真正成为数据边界。
- 历史修订中的餐食条目属于当时证据，不应使用当前条目表的排序假设。以不可变数组自身的原始序号作为读取顺序，既保留用户当时看到的内容，也避免把后来修改后的结构误写回旧记录。

## 6. 全局状态、项目反思与下一步

本轮把第 174 轮的风险反例转化成完整有界正文来源。餐食当前事实和纵向修订历史现在都能在同一 owner 事务内逐层读取，且最深失败不会产生部分提交；但它仍是独立来源，不能宣称完整异步归档已有第七字段。

Inspect → Rank → Improve → Validate 的下一步是新增递归餐食 JSON 适配器：原位包装 meal `items/history` 和 revision `snapshot.items`，证明无预取、完整 eager/lazy 字节等价与活动最深 item 的 JSON/数据库同根取消。完成后再用现有 `PoolClient` 注入方式接入第七协调字段。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 174 轮档案](174-portable-export-nutrition-meal-shape-boundary.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [营养记录模型](../architecture/NUTRITION_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0169](../architecture/decisions/0169-portable-export-nutrition-meal-layer-lifecycle.md)
