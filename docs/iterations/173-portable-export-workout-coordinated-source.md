# 第 173 轮：便携归档完整训练同根协调来源

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把已验证的完整 workouts 懒来源接为第六协调字段。验收标准为：六字段共享一个数据库事实时刻和一次 owner 校验；不得复制七层状态机；保持同步 JSONB 键序、全部 keyset、64 KiB 门禁与七段统计；完整递归 JSON 与 eager v4 逐字节相同；最深 set 取消以同一错误回滚统一根。

本轮不实现 `nutritionMeals`、不修改公开同步下载，也不新增 KMS、租约执行器、云配置、下载授权或客户端入口。真实账号、域名、设备和付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增六字段会话/收据、`coordinatedWorkoutJsonRows()` 和 `createConsentHealthCatalogWorkoutSnapshot()`。
  - 通过内部现有 `PoolClient` 适配器复用协调事务；workout 会话上下文跳过重复 owner 校验，并把最深错误提升到协调根。
  - 完成后合并 workout 头、当前动作/组、修订、snapshot 根/动作/组三层统计。
- `apps/api/src/privacy/portable-export-workout-json-source.ts`
  - 导出可复用的 `createPortableExportWorkoutJsonArray()`，独立会话与六字段适配器共享同一递归转换。
- `apps/api/src/privacy/portable-export-exercise-catalog-json-source.ts`
  - 新增六字段 JSON 适配器，前五字段与完整 workouts 共用一个根生命周期。
- 三个对应单元/集成测试文件
  - 证明单根流/单次 owner、完整七层统计、六字段字节等价、并发隔离和最深 set 同根取消。
- `docs/architecture/decisions/0167-portable-export-workout-coordinated-source.md`
  - 固定现有 client 适配、状态机单一实现、owner 校验和失败权威决策。
- 项目状态、架构、数据库、训练模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读第 172 轮与 ADR-0166，把范围冻结为 workouts 第六字段。
2. 审计七层 workout 会话，确认它已经完整满足内容分层，只缺事务与 owner 结论注入点。
3. 拒绝复制约 500 行状态机；为会话增加默认关闭的内部上下文，使独立调用保持原行为。
4. 用只转发 operation 的 `DatabaseService` 形状适配器绑定协调器现有 client，不触发第二次事务生命周期。
5. 在内部 workout 失败完成清理后调用协调 `failRoot`，让统一收据保留最深具体错误身份。
6. 导出 workout 懒数组适配函数，在六字段 JSON 来源中复用。
7. 先跑单元与真实 PostgreSQL 专项，再跑全量门禁；最后更新中文文档与 Obsidian 并提交。

## 4. 验证证据

- 目标单元测试：3 个文件、52/52 项通过。
- 目标真实 PostgreSQL 文件：39/39 项串行通过。
- 完整单元测试：100 个文件、563/563 项通过。
- 完整集成测试：23 个文件、116/116 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 数据库替身证明完整六字段只有一个根流和一次 owner 查询，七层收据全部进入统一结果。
- 真实数据库证明前五字段结束后的并发 workout 新增不可见；已有 workout 的当前关系与不可变修订完整输出。
- 完整六字段以 47 字节块增量编码，与 eager v4 逐字节相同。
- 活动不可变 snapshot set 中止时，最深未完成错误先关闭 workout 与协调根，迭代返回、JSON 收据和数据库收据引用同一错误。
- 中文文档、格式与迁移索引门禁通过，`docs/` 共 369 份 Markdown，第 090–173 轮 84 份、ADR-0085–0167 83 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像写入并逐字节验证通过：68,720 字节，SHA-256 `ff922f8154bf2539ed58388f3f35cb09030214e18dc7bce2f5e1fb070e4aa8fa`。

## 5. 发现的问题与经验

- “复用会话”不等于“复用事务”。只有把会话的数据库入口绑定到现有 client，并明确转移提交权，才能避免第二事实时刻。
- 小型现有 client 适配器比全局环境事务更容易审计：使用点、owner 跳过条件和根失败回调都显式可见。
- 嵌套会话必须先完成自己的最深清理，再调用父根失败；否则父事务清理可能与仍活动的子迭代器竞争。
- 统计合并应发生在内部会话完整 EOF 后，不能在每次 yield 时维护第二套计数逻辑。
- 保留独立 workout 入口可继续做分层诊断；协调入口只增加组合，不改变既有契约。
- 六字段完成不等于完整归档完成；nutrition、plans、AI、照片和执行保管链仍是独立门禁。

## 6. 全局状态、项目反思与下一步

本轮消除了完整 workouts 与前五字段之间的跨事务裂缝，同时保留了七层状态机的单一实现。当前同意、健康、两个自定义目录与训练事实已固定在同一事实时刻；但公开同步导出仍完整组装，后续集合仍未迁移，所以 R-013 只获得结构性缓解。

Inspect → Rank → Improve → Validate 的下一步是审计 `nutritionMeals`。餐食包含当前 items、无上限 history 和每条修订中的完整 items snapshot；必须先取得最大合法聚合反例、同步对象键序、软删除范围、稳定总序和索引证据，再决定分层状态机，不得直接复制同步聚合查询。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 172 轮档案](172-portable-export-food-catalog-coordinated-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0167](../architecture/decisions/0167-portable-export-workout-coordinated-source.md)
