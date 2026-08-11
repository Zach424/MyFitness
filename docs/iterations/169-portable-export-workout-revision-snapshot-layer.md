# 第 169 轮：便携归档训练完整修订快照同根组合

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 166 轮只有 workout 当前关系图与 revision header，第 168 轮只有独立单 revision snapshot；本轮冻结为一个有界关键路径：在同一 active-owner、只读 `REPEATABLE READ` 事务内，把当前 workout→exercise→set 与完整 revision→snapshot→exercise→set 组合起来。

验收标准为：当前关系图必须先完整结束；每条 revision 必须保持同步 v4 的 `{id,action,revision,snapshot,changed_at}` 键序，且当前 snapshot 完整 EOF 后才能推进下一条；所有父子字段恰好一次；shape、三层 64 KiB、JSON ordinality 和父级 UUID 唯一门禁不回退；显式 `complete()` 前不提交；任意深度取消先关闭最深活动来源；真实 PostgreSQL 与同步修订结构逐字节相同。

本轮不增加迁移、公开路由、同步下载改造、三字段协调器的第四字段、KMS、租约执行、云对象存储、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`
  - 新增完整修订组合的 revision/workout/session/receipt 类型和 `createWorkoutRevisionSnapshotLayerSnapshot()`。
  - 新增含 `snapshot: null` 的 bounded revision JSONB 页面查询；Node 原地替换该属性，保持同步对象键位。
  - 把单 revision 根→exercise→set 逻辑提炼为同 `PoolClient` 可复用节点；原 `createWorkoutRevisionSnapshot()` 同步改用该节点。
  - 既有 header-only 方法继续可用；共享组合器按模式选择 header 页面或完整 snapshot 页面，没有破坏旧行为。
  - 组合会话新增 snapshot root/exercise/set 三段收据，与 current header/exercise/set/revision 共七层计数。
  - history 强制当前关系图先 EOF，revision 强制当前 snapshot 先 EOF；取消依次清理活动 snapshot、history、当前关系父级和根事务。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`
  - 数据库替身扩展 shape、snapshot root/exercise/set 与含占位键修订页面。
  - 新增一个根事务的完整两修订组合、跨 revision 完整消费门禁和最深活动 set 取消三项证明。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 新增真实 PostgreSQL 两修订完整 history 逐字节同步等价证明。
  - 新增组合 history 未知 shape 在修订正文发出前失败关闭证明。
- `docs/architecture/decisions/0163-portable-export-workout-revision-snapshot-layer.md`
  - 固定复用节点、`snapshot: null` 占位、同根事务、逐 revision 背压、七层收据和下一层 JSON 适配边界。
- 项目状态、架构、数据库、训练模型、隐私所有权、路线图和 R-013 风险记录同步更新。

## 3. 实现方法

1. 复读项目状态、第 168 轮档案和 ADR-0162，确认本轮只承担 history 父子连接，不修改底层 shape 语义。
2. 审计第 166 轮当前图状态机和第 168 轮单 snapshot 状态机，识别复制嵌套取消逻辑会形成双权威实现。
3. 把 shape、根骨架、动作页面、组页面、一次性消费和最深层清理提炼为可挂载到已有 `PoolClient` 的单 revision 节点。
4. 先让既有单 revision 会话使用新节点，并运行原 35 项单元回归，证明提炼不改变行为。
5. 为修订页面增加 `NULL::jsonb AS snapshot`；由 PostgreSQL `to_jsonb(page)` 固定键序，解析后只原地替换现有属性。
6. 把 header-only 会话泛化为共享组合器；旧入口选择 header 模式，新入口选择完整 snapshot 模式。
7. 在 history 迭代器中为当前 revision 创建嵌套节点，交付后检查其完整 EOF；未消费或提前返回时清理节点并失败整个根。
8. 根取消先调用活动 snapshot 清理，再结束 history、当前 set/exercise 和事务迭代器；收据只在边界后的显式完成发布。
9. 用数据库替身验证单根流、顺序、逐 revision 门禁和最深层取消；用真实 PostgreSQL 验证对象键序、JSON ordinality、未知 shape 与逐字节兼容。
10. 运行完整单元、串行集成、strict 类型、生产构建、格式和生产依赖审计，再更新中文权威文档、ADR、迭代档案与 Obsidian 镜像。

## 4. 验证证据

- 提炼后原目标单元 35/35 先通过；新增组合证明后目标文件为 38/38。
- 目标真实 PostgreSQL 文件为 31/31；两条完整 history 的 `JSON.stringify` 与 `to_jsonb(history) - 'user_id' - 'workout_id'` 逐字节相同。
- 第一版快照含反序 position 和三组数据，组合输出保持 JSON 数组存储顺序；没有按 position 重排。
- 未消费当前 revision snapshot 就推进下一条会失败并回滚；未知 shape 在 revision 正文发出前返回固定不含秘密内容的错误。
- 活动 snapshot set 后主动取消会先结束 set 和 exercise，再结束 history，并以同一根错误拒绝 workouts 与收据。
- `batchRows=1` 的两 revision 夹具报告 revision header 2/2、snapshot root 2/2、snapshot exercise 2/2、snapshot set 2/2；真实数据库夹具报告 set 3/3。
- 完整单元测试：98 个文件、547/547 项通过。
- 完整集成测试：23 个文件、108/108 项串行通过，没有出现共享 Redis 429。
- 完整 strict typecheck、生产构建与格式检查通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 本轮没有新增迁移；中文文档与迁移索引门禁通过，`docs/` 共 361 份 Markdown，第 090–169 轮 80 份、ADR-0085–0163 79 份连续受保护，待迁移总量保持 191。
- Obsidian 镜像写入并逐字节验证通过：70,666 字节，SHA-256 `74f4e393ba98773bc0f495be7b450f0d3dc396c818bbfe30edef7996e553b2d3`。

## 5. 发现的问题与经验

- “复用同一查询”不等于“复用同一事务”。只有把单 revision 逻辑提炼为接收现有 `PoolClient` 的节点，才能同时消除快照裂缝和状态机复制。
- 懒对象字段也需要占位键。由 PostgreSQL 先生成 `snapshot: null` 再原地替换，可以把对象键序兼容交给已有 JSONB 表示证明。
- 跨 revision 背压必须是父级不变量。仅要求 snapshot 内部 exercise/set 完整，不足以阻止调用方在同一 history 上跳到下一条。
- 最深层错误可能从 history 调用栈内部进入根失败函数；活动父迭代器必须避免对正在执行的生成器再次 `return()`，再由其 `finally` 完成源清理。
- 收据应记录有界交付工作量而不是敏感身份或每条 shape。根/动作/组累计批次与行数足以证明消费，没有引入无界 per-revision 收据数组。
- 单元素 64 KiB 门禁解决数据库到 Node 的交付边界，不解决 PostgreSQL 重复展开 JSONB 的计算成本；后续仍需规模测量和执行器预算。

## 6. 全局状态、项目反思与下一步

本轮首次把 workout 当前关系事实和全部不可变修订正文放入同一数据库事实时刻，并完成逐修订背压、对象键序和最深层取消证明。它仍是数据库内部结构：`header` 与动作 `header` 尚未展开为递归 JSON 编码器可直接消费的完整 workout 对象，组合会话也没有进入同意/健康三字段协调器或公开 v4。因此不能声称异步训练导出或生产归档已完成。

Inspect → Rank → Improve → Validate 的下一步是建立一个内部 JSON 适配层，把 `{header,exercises,history}` 转成完整 workout 懒值，保持 workout/exercise/revision 的同步键序，并由现有增量编码器对真实 PostgreSQL `workouts` 数组做 eager/lazy 逐字节验证。JSON 根取消必须驱动同一会话 `cancel()`，只有字段物理 EOF 后才允许 `complete()`。在这项证明完成前，不把 workout 作为第四协调字段。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 168 轮档案](168-portable-export-workout-revision-snapshot-ordinality-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0163](../architecture/decisions/0163-portable-export-workout-revision-snapshot-layer.md)
