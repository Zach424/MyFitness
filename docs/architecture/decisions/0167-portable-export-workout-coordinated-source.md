# ADR-0167：便携归档完整训练同根协调来源

日期：2026-08-11

状态：已采纳

## 背景

第 170 轮已经证明完整七层 workouts 懒 JSON 与同步 v4 逐字节相同，但它拥有独立数据库事务。第 172 轮已把 workouts 之前的五个字段固定在同一个只读 `REPEATABLE READ` 根；直接拼接独立 workout 会话会产生第二事实时刻和第二次 owner 校验，不能证明完整归档一致性。

七层 workout 状态机已经覆盖 JSONB `history→exercises` 键序、当前动作/组、全部修订、revision snapshot 动作/组、keyset、64 KiB 单元素门禁、一次性消费和最深层取消。复制该状态机到协调器会增加两套容易漂移的隐私实现。

## 决策

1. 新增 `createConsentHealthCatalogWorkoutSnapshot()`，把 workouts 作为 `foodCatalog` 之后的第六字段；六字段共享一个 active-owner、只读 `REPEATABLE READ` 根事务。
2. 新增仅限内部的现有 `PoolClient` 数据库适配器。它只把 workout 会话请求的 `streamReadOnlyRepeatableRead(operation)` 绑定到协调器已打开的 client，不执行 BEGIN/COMMIT/ROLLBACK。
3. workout 会话新增内部上下文：`accountAlreadyValidated` 跳过第二次 owner 查询，`failRoot` 把 workout 最深层最终错误提升为协调根唯一失败。独立公开方法不传上下文，原行为保持不变。
4. 不复制或改写七层状态机。协调 row factory 消费 JSON 序 workout 会话，完成内部边界后把七段统计复制到统一收据；workout 头统计映射为顶层 `workouts`。
5. 六字段 JSON 适配器复用导出的 `createPortableExportWorkoutJsonArray()`，递归替换现有 workout 占位属性，并把协调会话作为唯一根生命周期。
6. 本轮不实现 `nutritionMeals`、不修改同步控制器或公开路由，也不新增 KMS、租约执行、下载授权或客户端入口。

## 影响

- 同意、健康、两个自定义目录与完整 workouts 首次属于同一数据库事实时刻；食物目录结束后的并发训练新增不会进入第六字段。
- 根数据库只建立一次流事务并查询一次 active owner；内部适配器不能在其他业务路径作为通用事务嵌套机制使用。
- 七层 workout 字段顺序、门禁、收据和取消逻辑只有一份实现；独立 workout 会话的既有测试与调用兼容。
- 活动不可变 set 取消先关闭最深节点和 workout 会话，再用同一错误关闭协调事务；JSON 与统一数据库收据引用同一错误。
- `nutritionMeals` 和后续集合仍未迁移，公开同步导出内存没有下降，R-013 继续开放。

## 备选方案

### 在五字段 JSON 后拼接独立 workout 事务

拒绝。两个 repeatable-read 快照不能证明同一事实时刻，并会重复 owner 校验与根取消权威。

### 把七层 workout 状态机复制进协调器

拒绝。两套键序、门禁和清理逻辑会产生高风险漂移，后续修复无法保证同时生效。

### 修改 DatabaseService 支持全局环境事务复用

拒绝。当前只需要一个明确受控的内部组合点；全局环境事务会扩大隐式重入、提交所有权和测试范围。

### 让内部 workout 收据独立完成后再异步合并

拒绝。统一收据必须在根物理 EOF 前保持未完成，且任一层失败必须拒绝同一个根结果。

## 验证

- 数据库替身必须证明六字段只有一个根流和一次账号校验，并完整统计 workout 七层。
- 适配器单元必须证明完整第六字段与 eager v4 逐字节相同。
- 真实 PostgreSQL 必须证明前五字段结束后的并发 workout 新增不可见、完整六字段与同步投影以 47 字节块相同。
- 活动不可变 snapshot set 中止必须让迭代返回、JSON 收据与统一数据库收据由同一具体错误拒绝。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0166：便携归档食物目录分层协调来源](0166-portable-export-food-catalog-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 173 轮档案](../../iterations/173-portable-export-workout-coordinated-source.md)
