# ADR-0169：便携归档餐食四层正文生命周期

日期：2026-08-11

状态：已采纳

## 背景

ADR-0168 已证明餐食修订历史不能作为 64 KiB 简单行聚合：30 个合法条目和 4 份完整 revision snapshot 已经越过单元素门禁。同步 v4 的 meal JSONB 键序为当前 `items` 在 `history` 之前；每条 history 又包含一份完整 `Meal` snapshot，其 `items` 数组必须保留不可变 JSON 存储顺序。

便携归档必须保留当前与软删除 meal、当前关系、全部 revision 头和全部历史快照正文，同时不能把 owner/meal/revision 标识或 food 内容放入完成收据。任一深层消费者提前停止都必须回滚同一个数据库事实时刻。

## 决策

1. 新增独立 `createNutritionMealLayerSnapshot()`，在一次 active-owner、只读 `REPEATABLE READ` 事务内交付完整 owner 餐食。
2. meal 头按 `(occurred_at,created_at,id)` keyset 覆盖软删除记录；当前 items 按父级唯一 position；history 按 revision；revision snapshot items 按 PostgreSQL `WITH ORDINALITY` 的 JSON 存储顺序分页。
3. PostgreSQL 分别生成含 `items: []`/`history: []` 的 meal 骨架、`snapshot: null` 的 revision 骨架，以及含 `items: []` 的 snapshot 根。Node 只原位替换已有属性，不重建标量对象或改变 JSONB 键位。
4. meal、当前 item、revision 头、snapshot 根和 snapshot item 五类 payload 分别执行 64 KiB UTF-8 门禁；oversized 正文在 PostgreSQL 中变为 `NULL`，不得跨进程边界。
5. snapshot 必须是对象且 `items` 必须是数组；否则在读取 snapshot 正文前返回固定 `portable_export_nutrition_meal_revision_snapshot_not_decomposable`。未知根键与 item 键原样保留，不静默丢弃。
6. 当前 items 必须在 history 前完整消费；每个 snapshot items 必须在下一 revision 前完整消费。每个数组只能读取一次。乱序、重复、跳过、早停和主动取消都优先关闭最深活动迭代器，再以同一根错误回滚事务。
7. 五段收据只记录批次与行数，不含 owner、meal、revision UUID、ordinality 或饮食正文。显式 `complete()` 只有在 meal 根到达物理边界后才能提交。
8. 本轮保持会话独立，不实现递归 JSON 适配器、不接入第七协调字段，也不修改公开同步下载。

## 影响

- 完整 `nutritionMeals` 正文首次可在有界数据库 payload 下读取，不再需要同步 `jsonb_agg(history)`。
- 同时间 UUID 总序与只读快照保证分页不重不漏，并隔离事务开始后的餐食新增。
- JSON ordinality 是不可变 snapshot 证据；它不由 position 重排，也不进入公开收据。
- 最深 snapshot item 的超限、停止或取消不能提交不完整餐食，也不能暴露被拒绝的正文。
- 独立会话尚不能证明餐食与前六字段属于同一事实时刻；R-013 风险等级不变。
- 该导出结构不验证营养数值、食物来源或膳食健康性，也不产生计划建议。

## 备选方案

### 把全部 history 先物化，再在 Node 中拆分

拒绝。无上限 JSONB 已经跨过数据库边界，后续拆分不能恢复内存上限或正文拒绝保证。

### 用 snapshot item position 作为不可变排序

拒绝。历史事实的权威顺序是存储 JSON ordinality；按 position 重排会改变既有证据，并可能掩盖旧数据问题。

### 在本轮同时接入第七协调字段

拒绝。正文形状、嵌套生命周期与跨字段事务所有权应分别验证；同时改变两者会扩大失败定位范围。

### 让未消费的子数组默认为空并继续

拒绝。这会把消费者错误伪装成完整归档，造成静默数据丢失。

## 验证

- 真实 PostgreSQL 必须证明相同时间 meal 的 UUID 总序、跨 owner 排除和事务开始后的新增不可见。
- 当前 items、history 和 snapshot items 的顺序必须分别匹配 position、revision 与 JSON ordinality；既有关系/修订查询计划必须命中索引。
- 完整物化餐食必须与同步 v4 JSONB 投影逐字节相同。
- 非数组 snapshot 必须在正文前固定拒绝；超限 snapshot item 不得在错误或收据中泄露 secret marker。
- 从活动 snapshot item 主动取消时，叶迭代、history、meal 根和数据库收据必须共享同一具体错误。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0168：便携归档餐食形状与历史聚合边界](0168-portable-export-nutrition-meal-shape-boundary.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [营养记录模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 175 轮档案](../../iterations/175-portable-export-nutrition-meal-layer-lifecycle.md)
