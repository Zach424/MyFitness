# ADR-0168：便携归档餐食形状与历史聚合边界

日期：2026-08-11

状态：已采纳

## 背景

同步 v4 的 `nutritionMeals` 把 meal 标量、当前 `nutrition_meal_items` 和全部 `nutrition_meal_revisions` 聚合成一行 JSONB。当前 items 有产品契约上限 30，但每次创建、更正和删除都会保存一份含完整 items 的不可变餐食快照，修订数量没有上限。把同步查询直接复制到 64 KiB 异步行门禁，会让合法长历史被拒绝；提高门禁则会恢复无界数据库聚合和 Node 分配。

同步餐食顶层只按 `(occurred_at,created_at)` 排序，同时间记录没有 UUID 尾键。现有列表索引是只覆盖未删除记录的降序部分索引，不能支持所有者导出必须包含的软删除保管范围。

在实现第七字段前，需要一份不泄露餐食正文、又能复现组件大小和历史聚合风险的数据库证据。

## 决策

1. 同步餐食顶层总序固定为 `(occurred_at,created_at,id)`；不改变当前 items 的 position 顺序、history 的 revision 顺序或修订 snapshot 内的 JSON 数组顺序。
2. 迁移 0035 新增非部分 `(user_id,occurred_at,created_at,id)` 索引。它覆盖活动与软删除 meal，不替代面向当前列表的既有部分降序索引。
3. 新增内部 `inspectNutritionMealShape(userId,mealId)`。它在 active-owner、只读 `REPEATABLE READ` 会话内分别测量 meal 空数组骨架、当前 item payload 和每条 revision payload，只返回修订号、计数、字节数与 snapshot items 形状布尔。
4. shape 查询不得使用 `jsonb_agg` 聚合 history，不返回 owner/meal/revision UUID、food 文本、note、source metadata 或任何 snapshot 正文。历史总量由逐行 `octet_length` 求和，用来证明单行聚合边界，而不是生成导出内容。
5. `historyAggregateExceedsPayloadBoundary` 只表示 revision payload 总量已经越过当前 64 KiB 单元素上限，不表示餐食无效，也不是删除、截断或拒绝用户证据的依据。
6. 后续正文来源必须按 meal 骨架、当前 items、history 头和 revision snapshot items 分层；本轮不输出 `nutritionMeals` 正文，不接入第七协调字段，也不修改公开同步下载。

## 影响

- 相同发生时间和创建时间的餐食拥有稳定 UUID 总序，未来 keyset 能覆盖全部 owner 历史和软删除证据。
- 真实合法餐食可以在不让正文跨出数据库的情况下证明历史聚合风险；收据可进入测试与架构审阅，但不得进入用户健康分析或日志正文。
- 单份 revision 当前低于 64 KiB 不代表未来始终如此；正文分层仍须对 revision 根与 snapshot items 分别执行数据库字节门禁。
- 本决策不验证营养事实准确性，不解释饮食健康情况，也不产生能量或膳食建议。
- R-013 获得可复现的餐食边界证据，但同步导出内存、餐食正文来源、后续集合、媒体和归档执行保管链仍未完成。

## 备选方案

### 直接复制同步 `jsonb_agg(history)`

拒绝。修订无上限，合法历史会形成无上限单行，并在 64 KiB 门禁处错误拒绝用户证据。

### 提高或取消单元素门禁

拒绝。它会恢复数据库到 Node 的无界 payload 分配，破坏第 157 轮以来的失败关闭边界。

### 只导出最新若干修订

拒绝。便携归档必须包含完整 owner 历史；静默截断会丢失更正、删除和来源演化证据。

### 只依据 Schema 推断最大大小

拒绝。Schema 能证明当前 items 数量上限，不能证明数据库 JSONB 编码、完整 revision 包装和实际索引计划。边界必须由真实 PostgreSQL 复现。

## 验证

- 契约合法的 30-item、4-revision 餐食必须让 revision payload 总量超过 64 KiB，同时 meal 头、当前 items 总量、单 item 和单 revision 分别低于该门禁。
- shape 收据不得包含 secret marker、owner UUID 或 meal UUID；跨 owner 查询必须返回统一 not-found。
- 迁移 0035 必须是非部分索引，且关闭顺序扫描时真实查询计划命中 `nutrition_meals_user_export_idx`。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0167：便携归档完整训练同根协调来源](0167-portable-export-workout-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [营养记录模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 174 轮档案](../../iterations/174-portable-export-nutrition-meal-shape-boundary.md)
