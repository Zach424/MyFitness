# ADR-0170：便携归档餐食递归懒 JSON 来源

日期：2026-08-11

状态：已采纳

## 背景

ADR-0169 已把完整 owner 餐食拆成 meal 头、当前 items、history 头、revision snapshot 根和 snapshot items 五类有界正文，并在一个独立只读数据库事务中固定消费顺序与失败所有权。但该会话仍暴露普通异步迭代器，尚不能直接放进只识别私有懒节点的增量 v4 JSON 编码器。

同步 v4 的 PostgreSQL JSONB 表示要求 meal 先枚举 `items` 再枚举 `history`，每条 revision 的 snapshot 又在原有 `items` 键位中交付不可变条目。适配层若预取、重建对象或另开事务，会分别破坏背压证据、逐字节兼容或同一事实时刻。完成与取消也不能出现第二个权威，否则最深层失败可能只关闭 JSON 而提交不完整数据库事务。

## 决策

1. 新增独立 `createPortableExportNutritionMealJsonSource()`，接收既有 `PortableExportNutritionMealLayerSnapshotSession`，只暴露私有标记的 `nutritionMeals` 懒数组与原会话生命周期。
2. meal 到达时，适配器验证 `items` 和 `history` 仍是数据库生成的空数组占位，再按原键位依次替换为当前 item 与 revision 懒节点；替换已有属性不得改变对象键序。
3. 每条 revision 到达时，适配器验证 `snapshot.items` 仍引用数据库会话提供的异步来源，再原位替换为私有懒节点。未知根键和条目键继续由底层值原样保留。
4. 适配器创建时不得读取 meal、当前 item、history 或 snapshot item；只有增量编码器到达相应字段才请求下一项。普通业务 iterable 仍不会被隐式视作 JSON 数组。
5. 完整 JSON 物理 EOF 直接调用原数据库会话 `complete()`；任意深度提前停止、编码失败或主动取消先关闭活动子迭代器，再调用原会话 `cancel()`。适配器不建立第二事务、收据或错误映射权威。
6. 适配层不重新实现父级身份、keyset、ordinality、64 KiB 门禁或一次性消费；这些约束继续由一个数据库状态机负责。
7. 本轮保持餐食来源独立，不通过 `PoolClient` 注入六字段协调根，不修改同步公开下载，也不增加迁移、路由、云配置或客户端入口。

## 影响

- 完整 `nutritionMeals` 首次可以由现有递归 JSON 编码器按字段逐层拉取，不需要在 Node 中组装当前 items 或全部修订历史。
- PostgreSQL 骨架和原位替换共同保持同步 v4 键序；真实数据库用 31 字节块证明 eager/lazy 输出逐字节相同。
- 活动 revision snapshot item 早停时，JSON 迭代、JSON 收据和数据库收据共享同一最深错误，事务回滚并释放连接。
- 适配器只改变内部表示，不验证营养值、食物来源或饮食健康性，也不生成计划建议。
- 餐食仍属于独立事务，不能证明它与前六字段来自同一事实时刻；R-013 风险等级不变。

## 备选方案

### 先物化完整餐食再交给普通 JSON 数组

拒绝。合法餐食历史已经证明可越过单元素上限；整体物化会重新引入无界对象图并使背压测试失真。

### 在适配器复制数据库状态机

拒绝。父级身份、分页、门禁、一次性消费与取消必须只有一个权威；复制实现会让数据库读取和 JSON 行为漂移。

### 用普通 AsyncIterable 作为隐式 JSON 数组

拒绝。业务对象也可能实现迭代协议，隐式识别会扩大可信输入面；现有私有 Symbol 标记是明确边界。

### 在本轮同时接入第七协调字段

拒绝。内容转换与跨字段事务所有权应分别验证；先固定适配器行为能缩小下一轮接入的变更面。

## 验证

- 单元替身必须证明创建来源后零拉取，并按 meal→当前 item→history→snapshot item 的顺序访问。
- 完整懒餐食必须与同一 eager v4 夹具逐字节相同，完成时只调用原会话 `complete()`。
- 活动最深 snapshot item 早停必须先关闭条目来源，再调用原会话 `cancel()`；JSON 收据必须复用该错误。
- 真实 PostgreSQL 必须以 31 字节块对比完整 `nutritionMeals` 与同步 JSONB 投影，并核对五段数据库收据。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0169：便携归档餐食四层正文生命周期](0169-portable-export-nutrition-meal-layer-lifecycle.md)
- [架构基线](../ARCHITECTURE.md)
- [营养记录模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 176 轮档案](../../iterations/176-portable-export-nutrition-meal-lazy-json-source.md)
