# 第 164 轮：便携归档训练动作同根分层生命周期

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 163 轮已经提供覆盖软删除 workout 的 owner-scoped 全历史头游标，但动作若另开事务会造成父子事实时刻裂缝，提前聚合又会恢复无界关系图。本轮只把 workout 头和一次性动作子流放入同一个根事务，并固定最小可逆的分层消费/取消契约。

验收标准固定为：一个 active owner 校验、一个只读 `REPEATABLE READ` 根事务；workout 头按 `(started_at,created_at,id)` 总序，动作按父级唯一 `position` 总序；动作只含九个标量并复用 25/100 行批次与 64 KiB 门禁。每个动作子流必须恰好一次且完整消费，外层才能前进；跳过、重复、提前停止和主动取消必须先关闭活动子流，再回滚根事务。外层到达私有边界后仍不得提交，必须显式 `complete()`。

范围不增加迁移、sets/修订来源、第四协调字段、同步导出变化、公开路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增训练头/动作分层 session、统一收据、实际动作分页 SQL、九字段页生成器、一次性子流和显式根完成/取消生命周期。
- 动作 SQL 通过 `workout_sessions` join 绑定认证 owner 与精确 workout，UUID 锚点只在同 owner/workout 内恢复 position；投影仍由 PostgreSQL 先编码、计量并经过统一 payload 门禁。
- 外层异步 iterable 只允许消费一次；当前 exercise 子流未启动或未到 EOF 时，外层不能读取下一个 workout。子流重复、早停与来源错误都会失败关闭根事务。
- `complete()` 只在外层到达私有 boundary 后推进事务物理 EOF；`cancel()` 先关闭活动 exercise，再关闭根 transaction，清理失败不掩盖根因。
- 单元测试新增正常分层、跳过、提前停止和重复消费四项；真实集成新增同根快照/owner/软删除/并发隔离、既有索引计划和活动子流取消三项。
- ADR-0158 固定父子快照、最深活动子流清理、显式提交和不接入公开 v4 的边界；状态、架构、数据库、训练模型、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 163 轮状态、档案、ADR-0157 与训练关系模型，确认最高优先级不是公开 v4，而是消除 workout→exercise 父子跨事务裂缝。
2. 复用第 163 轮 workout 头页源，避免复制 owner、软删除、排序和 64 KiB 规则；在同一数据库 client 上创建每头一次性的动作页源。
3. 只选择创建/修订契约已经保存的九个动作标量，明确排除 sets，避免用空数组伪造完整对象。
4. 让动作页只在调用方遍历子字段时启动；每个 workout yield 返回后立即检查子流是否已启动并完成，未满足就终止根生成器。
5. 为子流包装 `finally`：若没有到达来源 EOF，先对来源调用 `return()`，再用同一根错误取消事务；外部根取消先设置 finalized，避免子流清理递归替换根因。
6. 在私有 boundary 暂停 transaction generator；只有调用方明确 `complete()` 才推进下一步、触发数据库提交并发布头/动作分集合收据。
7. 用内存数据库替身分别验证一次 owner/stream、提交时刻、跳过、早停和重复消费；所有失败比较根 receipt 的错误对象恒等。
8. 在真实 PostgreSQL 中创建两个 owner workout（含软删除）和反序插入动作，以每批一行消费；首个动作后向当前及后续 workout 并发插入，证明根快照一致。
9. 从 `pg_index` 读取既有唯一索引定义，并在事务内局部关闭顺序扫描，对同一动作分页 SQL 执行 JSON 格式 EXPLAIN。
10. 先运行目标 16 项单元、17 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建、格式与生产依赖审计。
11. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、16/16 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、17/17 项通过；本轮没有新增迁移。
- 两个 owner workout 在同一根事务中输出三个原始动作；一条软删除会话保留，其他 owner 与打开快照后的两个并发动作均不出现。
- 动作按 position `[1,2]` 输出，每项恰好包含九个允许字段且没有 sets。
- PostgreSQL 目录确认 `workout_exercises_workout_id_position_key` 为非部分 `(workout_id,position)` 唯一索引；同一实际动作页 SQL 的计划 JSON 命中该索引。
- 外层结束后 receipt 保持未结算；显式 `complete()` 后报告 workout 头 2 批/2 行、动作 3 批/3 行。
- 跳过、重复、提前停止分别拒绝根收据；主动取消保留 lease owner 原错误，并使活动动作迭代器先到达关闭状态。
- 完整单元为 98 个文件、525/525 项；完整集成为 23 个文件、94/94 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引门禁通过：`docs/` 共 351 份 Markdown，第 090–164 轮与 ADR-0085–0158 连续受保护，待迁移总量保持 191。
- Obsidian 镜像完成写入并逐字节验证：70,609 字节，SHA-256 为 `6ae0b7817fd454d8be56b1535a6bc8467ca152150983b635d2257ad41ee86a97`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 父子都可分页不等于共享事实时刻；只有复用同一数据库 client 和根事务，才能防止当前动作与后续 workout 动作被不同并发写穿透。
- 懒子流有三种不同状态：未开始、活动、已完成。外层必须逐一失败关闭，不能把未开始或早停解释成空集合。
- 私有 boundary 把“数据遍历结束”和“事务可以提交”分开。该暂停点让未来 JSON 根 EOF 成为唯一提交责任人。
- 活动子流清理必须先于根事务关闭，否则数据库 client 可能在内层生成器仍持有时被释放；外部取消先标记 finalized 可避免 finally 再次取消并替换原错误。
- 既有唯一约束只有在实际生产 SQL 的计划树中出现后，才能作为可复现的读取证据；无需为相同顺序增加重复索引。
- 分层收据应分别记录父级和子级批次/行数，避免一个合计数掩盖某层未被遍历。

## 6. 全局状态、项目反思与下一步

本轮让纵向训练事实的前两层第一次共享 owner、快照、提交和取消责任。它建立了可继续递归的数据库生命周期，但没有减少当前同步导出内存，也没有向用户发布缺少 sets/history 的对象。

Inspect → Rank → Improve → Validate 的下一步应在同一根事务中为每个 exercise 增加 sets 子层：按父级唯一 position 输出有界组标量，要求 workout→exercise→set 三层严格按序且完整消费，并证明最深活动 set 早停或根取消会先关闭该子流、再逐层回滚。仍不得用空 history 冒充完整 v4。之后再处理可能超过 64 KiB 的修订 snapshot；必须分解而不是调高门禁或丢弃历史。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 163 轮档案](163-portable-export-workout-header-keyset.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0158](../architecture/decisions/0158-portable-export-workout-exercise-layer-lifecycle.md)
