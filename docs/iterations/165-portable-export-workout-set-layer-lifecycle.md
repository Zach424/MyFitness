# 第 165 轮：便携归档训练组三层同根生命周期

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 164 轮已经把 workout 头和动作头放入同一个 owner 快照，但 sets 仍会迫使后续实现选择“另开事务”或“重新聚合”。本轮只增加第三层一次性 set 子流、最深层清理顺序和真实索引/快照证据，不提前交付缺少 history 的 v4。

验收标准固定为：一个 active owner 校验、一个只读 `REPEATABLE READ` 根事务；workout 头按 `(started_at,created_at,id)` 总序，exercise 与 set 都按各自父级唯一 `position` 总序。set 只含十一个标量并复用 25/100 行批次与 64 KiB 门禁。workout、exercise、set 必须逐层恰好一次且完整消费；跳过、重复、提前停止和主动取消必须先关闭最深活动 set，再关闭 exercise 和根事务。外层到达私有边界后仍必须显式 `complete()`。

范围不增加迁移、修订/history 来源、公开协调字段、同步导出变化、路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增 set 页实际 SQL、十一字段页生成器、三层 session/receipt 类型、`createWorkoutSetLayerSnapshot()` 和 set→exercise→transaction 清理顺序。
- set SQL 通过三表 join 同时绑定认证 owner、精确 workout 与精确 exercise；UUID 锚点只在同一父链中恢复 position，payload 继续由 PostgreSQL 编码和计量。
- exercise 子流为每个动作创建一次性 set 子流；set 未开始、未完成或重复读取时，exercise 不能前进。exercise 未开始或未完成时，workout 不能前进。
- `complete()` 只在外层私有 boundary 后推进事务物理 EOF；`cancel()` 依次关闭活动 set、活动 exercise 和根 transaction，清理错误不替换原始根因。
- 单元测试新增正常三层提交、跳过 exercise、跳过 set、set 早停、重复 set 和最深层主动取消六项；真实集成新增三层 owner/软删除/并发隔离、既有 set 索引计划和活动 set 取消三项。
- ADR-0159 固定十一字段白名单、三层顺序、最深层清理和不接入公开 v4 的边界；状态、架构、数据库、训练模型、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 164 轮权威状态、档案、ADR-0158 与训练表约束，确认既有 `UNIQUE (exercise_id,position)` 可以直接服务 set keyset，无需迁移。
2. 复制同步导出的 set 标量白名单，明确排除 `exercise_id`；组身份只由父级闭包和 owner-bound join 建立。
3. 沿用 workout/exercise 的 UUID-only 应用游标模式，让数据库在同一 owner/workout/exercise 快照内回查完整 position 锚点。
4. 在第 164 轮双层方法旁新增独立三层方法，保持前一轮内部契约可回退，避免把生命周期扩展混入无关重构。
5. 为 set 包装一层来源生成器：正常 EOF 标记完成；来源错误或提前 `return()` 先关闭 set 来源，再取消根事务。
6. 为 exercise 包装增加 `suppressSetRootFailure` 清理阶段。exercise 自身提前关闭时先关闭活动 set，再关闭动作页来源，最后只调用一次根失败，避免递归取消替换原错。
7. 根 `fail()` 固定 set→exercise→transaction 顺序并聚合清理错误；私有 boundary 与显式 `complete()` 继续分离遍历结束和提交责任。
8. 用数据库替身逐一验证三层成功收据、父/子跳过、set 早停/重复和活动 set 取消后的三个迭代器状态。
9. 在真实 PostgreSQL 中创建软删除 owner workout、两个动作和反序 sets；首个 set 后向当前与后续 exercise 并发新增，证明整棵树共享已打开快照。
10. 从 `pg_index` 校验既有 set 唯一索引无谓词，并在事务内局部关闭顺序扫描，对同一生产 set 页 SQL 执行 JSON 格式 EXPLAIN。
11. 先运行目标 22 项单元、20 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建、格式与生产依赖审计。
12. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、22/22 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、20/20 项通过；本轮没有新增迁移。
- 一条软删除 owner workout 输出两个动作和三个原始 set；其他 owner 与打开快照后加入当前/后续 exercise 的两个 set 均不出现。
- set 按 position `[1,2]` 输出，每项恰好包含十一个允许字段，不含 `exercise_id`。
- PostgreSQL 目录确认 `workout_sets_exercise_id_position_key` 为非部分 `(exercise_id,position)` 唯一索引；同一实际 set 页 SQL 的计划 JSON 命中该索引。
- 外层结束后 receipt 保持未结算；显式 `complete()` 后报告 workout 头 1 批/1 行、动作 2 批/2 行、组 3 批/3 行。
- 跳过 exercise、跳过 set、set 早停和重复 set 分别拒绝根收据；主动取消保留 lease owner 原错误，并依次关闭 set、exercise 与 workout 迭代器。
- 完整单元为 98 个文件、531/531 项；完整集成为 23 个文件、97/97 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引门禁通过：`docs/` 共 353 份 Markdown，第 090–165 轮与 ADR-0085–0159 连续受保护，待迁移总量保持 191。
- Obsidian 镜像完成写入并逐字节验证：`70,837` 字节，SHA-256 `fed02e6710ed4aef646387a2ba78eb262825b0b9d7acc6a15cd62d77c6d22545`；仓库内 `docs/PROJECT_STATUS.md` 继续作为权威副本。

## 5. 发现的问题与经验

- 三层生命周期不能只在根层判断“是否完成”。每个父层都必须区分子流未开始、活动和已完成，否则跳过 set 会被误解释成空组。
- 清理顺序是保管语义的一部分。最深生成器仍持有数据库 client 时先关闭根事务，会制造释放后继续读取或掩盖错误的风险。
- 子层清理触发父层清理时需要抑制递归根失败；先完成局部来源关闭，再只发布一次根错误，错误对象和收据才稳定。
- owner 约束必须沿完整父链出现在 set SQL 及锚点子查询中。精确 exercise UUID 不能独立证明它属于认证用户或目标 workout。
- 既有唯一位置索引可以复用，但仍需生产实际 SQL 的计划证据；约束定义与查询可消费性是两类不同证明。
- 当前关系图分层完成不等于 workout 导出完成。不可变 revision snapshot 仍可能独立超过 64 KiB，且不能被截断或省略。

## 6. 全局状态、项目反思与下一步

本轮把纵向训练当前事实的 workout、exercise 和 set 三层固定到同一个 owner 快照，并让最深层背压与取消责任可复现。它为最终递归 v4 组合补齐当前关系图基础，但没有减少当前同步导出内存，也没有包含任何修订历史。

Inspect → Rank → Improve → Validate 的下一步应为单个 workout 在同一根事务中增加按 revision 总序的修订头层，先投影有界身份、动作与时间标量，并证明软删除、owner、并发追加、顺序和取消。`workout_revisions.snapshot` 保存完整图且可能超过 64 KiB，之后必须递归分解为有界 workout/exercise/set 事实，不能调高门禁、截断 snapshot 或丢弃 history。在此之前仍不得接入公开 v4。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 164 轮档案](164-portable-export-workout-exercise-layer-lifecycle.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0159](../architecture/decisions/0159-portable-export-workout-set-layer-lifecycle.md)
