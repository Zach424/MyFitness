# 第 170 轮：便携归档训练完整懒 JSON 来源

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只把第 169 轮的 workout 七层数据库会话适配为递归 JSON 编码器可直接消费的完整 `workouts` 懒数组。验收标准为：审计并保持同步 v4 的对象键序；当前关系图与全部 revision snapshot 继续共享一次 active-owner、只读 `REPEATABLE READ` 事务；每个嵌套数组按需拉取且严格背压；完整数组与同步 PostgreSQL 聚合逐字节相同；JSON 完成/取消驱动同一数据库根生命周期；任意深度取消保留最深层错误和统一失败收据。

本轮不新增数据库迁移、公开 API、同步下载改造、跨顶层协调字段、KMS、租约执行器、云对象存储配置、下载授权或客户端入口。真实账号、云服务、域名、微信设备与付费 API 继续停放。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增 workout JSONB 骨架查询，预留 `history: []` 与 `exercises: []`；当前 exercise 骨架预留 `sets: []`。
  - 七层共享会话由布尔开关改为 `headers | snapshots | json` 明确模式；旧入口维持关系图优先，新 JSON 入口按实际键序开放 history 后 exercises。
  - 新增内部 `createWorkoutRevisionSnapshotJsonLayerSnapshot()`，继续复用 owner 门禁、shape、keyset、64 KiB、ordinality、一次性消费、完成和取消状态机。
- `apps/api/src/privacy/portable-export-workout-json-source.ts`
  - 新增 `createPortableExportWorkoutJsonSource()`，把数据库层 workout/current exercise/revision snapshot exercise/set 递归包装为私有懒数组。
  - 所有占位属性都在原键位替换；适配器透传数据库收据、`complete()` 与 `cancel()`，不产生第二个事务或完成权威。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`
  - 新增 JSON 字段顺序门禁，证明 history 未结束时当前 exercises 不能启动。
- `apps/api/src/privacy/portable-export-workout-json-source.test.ts`
  - 新增完整对象键序、拉取顺序、字节等价与活动 snapshot set 关闭后再取消根生命周期证明。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 新增真实 PostgreSQL 完整 `workouts` eager/lazy 逐字节比较。
  - 新增活动不可变 set 中止后迭代器、JSON 收据和数据库收据共享同一最深层错误证明。
- `docs/architecture/decisions/0164-portable-export-workout-lazy-json-source.md`
  - 固定实际 JSONB 键序、双模式共享状态机、占位骨架、原位递归适配和 JSON 根生命周期决策。
- 项目状态、架构、数据库、训练模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读项目状态、第 169 轮和 ADR-0163，把本轮边界冻结为完整 workout JSON 适配，不提前加入跨顶层协调。
2. 用真实 PostgreSQL 查询同步投影，确认 workout JSONB 的对象键序是 `history` 先于 `exercises`，而不是根据 TypeScript 类型或源码书写顺序推断。
3. 拒绝缓存无界当前关系图、打开第二个事务或修改 v4 字节顺序，改为在既有七层状态机增加显式 JSON 字段顺序模式。
4. 让 PostgreSQL 为 workout 和当前 exercise 生成含空数组的 JSONB 骨架，继续复用 revision 的 `snapshot: null` 及 snapshot 动作的 `sets: []`；Node 只原位替换属性。
5. 以私有 `portableExportJsonAsyncArray` 包装每层迭代器，使递归编码器到达字段时才拉取，不把普通 iterable 业务对象误判为数组。
6. 把数据库会话绑定为 JSON 根生命周期：完整字段物理 EOF 后显式完成，提前停止先关闭活动子源再取消会话。
7. 先以数据库替身证明顺序和清理，再用真实 PostgreSQL 比较完整数组并验证活动 set 取消；随后运行完整质量门禁。
8. 更新中文权威文档、ADR、风险、迭代档案与 Obsidian 镜像，最后以 Conventional Commit 提交。

## 4. 验证证据

- 目标单元测试：两个文件共 41/41 项通过，其中数据库会话 39 项、JSON 适配器 2 项。
- 目标真实 PostgreSQL 文件：33/33 项串行通过。
- 完整单元测试：99 个文件、550/550 项通过。
- 完整集成测试：23 个文件、110/110 项串行通过，没有共享 Redis 429。
- 完整 strict typecheck、生产构建与格式检查通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 真实数据库完整 `workouts` 数组以 37 字节块增量编码，与同步 v4 的 `JSON.stringify` 逐字节相同。
- JSON 拉取顺序为 history→revision snapshot exercise→snapshot set→当前 exercise→当前 set；history 完成前读取当前关系会失败关闭。
- 活动 revision snapshot set 中止时，最深层 set 先关闭；流、JSON 收据和数据库收据由同一固定错误拒绝。
- 本轮没有新增迁移；中文文档与迁移索引门禁通过，`docs/` 共 363 份 Markdown，第 090–170 轮 81 份、ADR-0085–0164 80 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像写入并逐字节验证通过：69,185 字节，SHA-256 `6906344b7ac8dc3154b9908c85d586ef4b2ad5c5332c7593e8142969fb8b0f8b`。

## 5. 发现的问题与经验

- TypeScript 对象书写顺序不能代替 PostgreSQL JSONB 的真实输出证据。只有对同步查询直接取样，才能冻结逐字节兼容需要的 workout 键序。
- 同一个领域图可能需要不同的受控遍历顺序。把顺序建模为共享状态机的显式模式，可以同时保留内部审计接口兼容和外部 JSON 字节兼容。
- 懒数组占位必须由数据库先创建，再在 Node 原位替换。删除并追加属性虽然值相同，却会改变最终 JSON 对象键序。
- 取消时最深数据库生成器可能先于 JSON 编码器报告未完成错误；保留该更具体的根错误，比用通用 JSON 错误覆盖它更能证明责任落点。
- “完整 workout 可懒编码”不等于“完整归档已流式化”。跨顶层事实时刻、目录字段、后续集合、媒体与执行保管链仍是独立门禁。
- 训练 JSON 会话仍让 PostgreSQL 为每条修订执行 shape 检查和 JSONB 分解；本轮限制数据库到 Node 的交付，不声称数据库内部计算成本有界。

## 6. 全局状态、项目反思与下一步

本轮首次让完整 workout 当前关系和所有不可变修订证据直接进入现有递归增量 JSON 编码器，并用真实数据库同时证明字节兼容、同一事实时刻、逐层背压和最深层取消。训练来源不再需要由调用方组装对象图，但它仍是独立事务，公开同步导出也没有改用该来源，所以 R-013 只获得结构性缓解，继续保持中等级开放。

Inspect → Rank → Improve → Validate 的下一步必须遵守 v4 顶层字段顺序：先审计并建立 `exerciseCatalog` 的 owner/内置目录边界、稳定排序、字段键序、keyset 锚点、64 KiB 门禁和同事务生命周期，再把它作为 consent/health/revision 后的第四个协调字段。`foodCatalog` 与 workouts 继续位于其后，不能跨事务拼接或整体缓存以跳过目录依赖。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 169 轮档案](169-portable-export-workout-revision-snapshot-layer.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0164](../architecture/decisions/0164-portable-export-workout-lazy-json-source.md)
