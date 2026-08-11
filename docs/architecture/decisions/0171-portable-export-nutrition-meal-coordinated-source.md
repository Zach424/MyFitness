# ADR-0171：便携归档餐食第七协调字段

日期：2026-08-11

状态：已采纳

## 背景

ADR-0169 已把完整 owner 餐食拆成 meal 头、当前 items、history 头、revision snapshot 根和 snapshot items 五类有界正文；ADR-0170 又把该会话适配成增量 JSON 编码器可消费的递归 `nutritionMeals` 懒数组。但独立会话拥有自己的只读事务和 active-owner 查询，因此只能证明餐食内部一致，不能证明它与同意、健康、两个 owner 目录和 workouts 来自同一事实时刻。

第 173 轮已为完整 workouts 固定现有 `PoolClient` 注入模式：嵌套状态机复用协调根的事务与 owner 结论，协调器只负责字段顺序、顶层边界和统一收据，不复制子层分页与取消逻辑。餐食接入必须沿用同一所有权模型，并保持第 176 轮 JSON 键序与零预取行为。

## 决策

1. 新增 `createConsentHealthCatalogWorkoutNutritionSnapshot()`，保留现有六字段入口不变，并按 v4 顺序把 `nutritionMeals` 追加为第七字段。
2. 为餐食状态机增加仅供内部协调使用的上下文：`accountAlreadyValidated` 允许跳过已由根完成的 active-owner 查询，`failRoot` 允许最深餐食错误关闭协调根。独立入口继续使用默认上下文，行为不变。
3. 协调餐食行工厂以当前 `PoolClient` 构造不拥有事务的数据库适配器，再调用既有餐食会话。适配器不得开始、提交或回滚第二事务，也不得实现第二套 meal/item/history 状态机。
4. 顶层 `nutritionMeals` 统计由协调器维护；当前 items、revisions、revision snapshot 根和 snapshot items 四段子统计在餐食会话完整结束后复制进统一收据。收据不包含 owner、meal、revision、food 或正文标识。
5. 新增 `createPortableExportConsentHealthCatalogWorkoutNutritionJsonSource()`，组合既有目录、workout 与餐食递归数组适配器。它直接透传协调会话的 receipt、complete 与 cancel，不建立第二生命周期权威。
6. 旧六字段入口、独立餐食入口和同步公开下载保持不变；本轮不增加迁移、路由、云配置、KMS、租约执行器、下载授权或客户端入口。
7. 相同时间戳的餐食按同步契约 `(occurred_at,created_at,id)` 排序；测试夹具不得把创建先后误当成数据库总序。

## 影响

- 同意、健康、两个 owner 目录、完整 workouts 与完整 nutritionMeals 首次来自一次 active-owner、只读 `REPEATABLE READ` 事务。
- 前六字段结束后才创建的餐食对第七字段不可见；餐食不再拥有第二事实时刻。
- meal/current items/history/revision snapshot items 的 keyset、JSON ordinality、64 KiB 门禁、一次性消费和最深取消继续只有一个状态机权威。
- 完整七字段懒正文可与同步 eager v4 逐字节对账；活动历史 snapshot item 早停时，JSON 收据、协调收据与数据库来源共享同一个最深错误。
- 旧六字段和独立餐食 API 保持可用，降低增量接入对现有调用方的破坏风险。
- 该变更只改善隐私归档传输与事实一致性，不验证营养准确性，也不生成饮食或医疗建议。

## 备选方案

### 修改原六字段入口并直接追加餐食

拒绝。现有调用方可能依赖六字段类型与消费终点；新增明确入口可以在没有公共 API 迁移的前提下验证第七字段，且便于回滚。

### 在协调器复制餐食分页与嵌套状态机

拒绝。复制会产生第二套键序、门禁、一次性消费和失败规则，最深层错误容易被根通用取消覆盖。

### 由餐食层自行开启嵌套只读事务

拒绝。两个 repeatable-read 事务可能看到不同数据库时刻，不能满足便携归档跨字段事实一致性。

### 先物化餐食再作为普通数组追加

拒绝。合法历史总量已超过 64 KiB，整体物化会恢复无界 Node 对象图，并破坏背压与最深取消证据。

## 验证

- 单元替身必须证明七字段只创建一个事务流、只查询一次 active owner，并能完整提交餐食空字段。
- JSON 单元必须证明 `nutritionMeals` 排在 workouts 之后，三段餐食嵌套数组保持递归字段顺序，完整正文与 eager v4 逐字节相同。
- 真实 PostgreSQL 必须在前六字段结束后插入并发餐食，并证明第七字段只看见根事务开始时已有的记录。
- 真实 PostgreSQL 必须对完整七字段 eager/lazy 正文逐字节对账，并核对餐食五段行数收据。
- 活动 revision snapshot item 早停必须让 JSON 迭代返回、JSON 收据和协调数据库收据引用同一最深错误。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0170：便携归档餐食递归懒 JSON 来源](0170-portable-export-nutrition-meal-lazy-json-source.md)
- [ADR-0167：便携归档完整训练协调来源](0167-portable-export-workout-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [营养记录模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 177 轮档案](../../iterations/177-portable-export-nutrition-meal-coordinated-source.md)
