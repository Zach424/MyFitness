# ADR-0172：便携归档营养收藏第八协调字段

日期：2026-08-11

状态：已采纳

## 背景

ADR-0171 已让同意、健康当前/修订、两个 owner 目录、完整 workouts 与完整 nutritionMeals 共享一次 active-owner、只读 `REPEATABLE READ` 协调事务。同步 v4 中紧随餐食的是 `nutritionFavorites`，但看似简单的数组仍必须先核对所有权、删除语义、字段键序、合法最大行、稳定锚点与索引，不能直接假定它适合普通 keyset 来源。

审计确认 `nutrition_favorites` 只有当前快照，没有软删除列或历史表；取消收藏会物理删除行。同步投影包含十四个字段，并按食物键稳定输出。表的复合主键 `(user_id,food_key)` 已同时覆盖 owner 范围和唯一总序，因此无需为异步归档新增索引。

首次测试普通协调数组的活动早停还暴露了一个生命周期缺口：底层迭代器和协调数据库收据会以根错误拒绝，但描述驱动协调器的提前返回路径可能正常结束，使 JSON 层随后创建第二个通用错误。第八字段不能在存在两个失败权威的情况下接入。

## 决策

1. 新增独立 `createNutritionFavoriteSnapshot()`，只导出当前 active owner 的现存收藏，不推测或合成已经删除的收藏历史。
2. 数据库查询精确复用同步 v4 的十四字段对象，按 `food_key` 升序 keyset；复合主键 `(user_id,food_key)` 是当前 owner 查询和总序的权威，不增加迁移。
3. 通用有界 payload 解析器接受可指定的身份键。收藏在内部用 `food_key` 定位重复或错误行，但公开 JSON 不增加不存在于同步契约的 `id` 字段。
4. 每个 PostgreSQL JSON payload 在交付 Node 前以 `octet_length` 执行 64 KiB UTF-8 门禁。最大契约合法行必须低于门禁，一字节不足必须在正文交付前失败。
5. 新增 `createConsentHealthCatalogWorkoutNutritionFavoriteSnapshot()`，保留既有七字段入口不变，并把 nutritionFavorites 作为第八个简单字段追加到描述列表末尾。
6. 新增 `createPortableExportConsentHealthCatalogWorkoutNutritionFavoriteJsonSource()`，把收藏包装成普通私有懒数组，并直接复用协调会话的 receipt、complete 与 cancel。
7. 描述驱动协调器在没有到达字段边界且未完成时必须抛出已登记根错误。迭代器提前返回、JSON 收据和数据库收据不得各自生成不同通用错误。
8. 本轮不修改同步公开路由、同步字段顺序、收藏业务接口、表结构、云配置、KMS、租约执行器、下载授权或客户端入口。

## 影响

- 前八个同步 v4 顶层字段首次共享一个 active-owner、只读 repeatable-read 事实时刻；根开始后新增的收藏对第八字段不可见。
- 收藏所有权与删除语义保持诚实：只导出当前 owner 行，不把物理删除解释为可恢复历史。
- 复合主键同时承担隔离、锚点唯一性与查询计划，避免为了顺序稳定性创建冗余索引。
- 可指定身份键让普通字符串主键来源复用统一门禁与分页状态机，同时保持同步对象逐字节兼容。
- 普通数组与嵌套数组现在共享同一个失败权威；活动字段提前停止不能提交根事务，也不能由 JSON 层覆盖原错误。
- 该变更只改善隐私归档的一致性和有界传输，不验证收藏营养值、食物质量，也不生成饮食或医疗建议。

## 备选方案

### 给收藏 payload 增加内部 `id` 后直接导出

拒绝。额外字段会破坏同步 v4 逐字节兼容，也会把实现便利伪装成用户数据事实。

### 新增 `(user_id,food_key)` 导出索引

拒绝。现有复合主键已经提供同一前缀和顺序，真实查询计划能够命中；新增索引只会增加写入与维护成本。

### 导出已取消收藏历史

拒绝。当前模型没有这类事实。便携归档不能从物理删除结果反推时间、动作或旧正文。

### 让 JSON 层在协调迭代器正常返回后创建自己的失败

拒绝。这会产生两个生命周期权威，使调用方无法稳定判断根事务为何回滚，也掩盖真正的活动字段。

### 直接修改原七字段入口

拒绝。新增明确入口保留既有调用方的类型与消费终点，提供更小且可逆的接入面。

## 验证

- 单元替身必须证明第八字段仍只创建一个事务流、只查询一次 active owner，并返回空收藏收据。
- 最大契约合法收藏行必须低于 64 KiB；把门禁设为正文前一字节时必须在任何 payload 交付前拒绝。
- 真实 PostgreSQL 必须证明跨 owner 行排除、`food_key` 总序、根后并发新增不可见，以及实际查询计划使用复合主键。
- 完整八字段 eager/lazy v4 必须在小块输出下逐字节相同，并核对收藏批次/行数收据。
- 活动收藏早停必须让迭代器返回、JSON 收据和协调数据库收据引用同一个根错误。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0171：便携归档餐食第七协调字段](0171-portable-export-nutrition-meal-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [营养记录模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 178 轮档案](../../iterations/178-portable-export-nutrition-favorite-coordinated-source.md)
