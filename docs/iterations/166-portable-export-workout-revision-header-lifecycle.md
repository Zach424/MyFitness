# 第 166 轮：便携归档训练修订头同根生命周期

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 165 轮已经有 workout→exercise→set 当前关系图，但缺少同一事实时刻的纵向修订边界。本轮只新增四字段 revision 头、关系图→history 顺序和同根取消责任，不把可能超限的完整 `snapshot` 伪装成已流式化。

验收标准固定为：一次 active owner 校验、一个只读 `REPEATABLE READ` 根事务；workout、exercise 与 set 沿用既有总序，revision 按父级唯一 `revision` 升序。revision 头只含 `id,action,revision,changed_at`，复用 25/100 行批次与 64 KiB 门禁。关系图必须先完整消费，history 才能启动；每层均须恰好一次且完整结束。乱序、跳过、重复、提前停止和主动取消必须关闭最深活动来源并回滚根事务；外层到达私有边界后仍须显式 `complete()`。

范围不增加迁移、revision snapshot 解析、公开协调字段、同步导出变化、路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增 revision 头实际 SQL、四字段页生成器、四层 session/receipt 类型与 `createWorkoutRevisionHeaderLayerSnapshot()`。
- revision SQL 通过父表 join 同时绑定认证 owner、冗余 history owner 与精确 workout；UUID 锚点只在同一 owner/workout 内恢复 revision，payload 继续由 PostgreSQL 编码和计量。
- 每个 workout 同时暴露一次性 `exercises` 与 `history`，但 history 只有在 exercises/sets 完整结束后才允许启动；任一兄弟字段乱序、跳过、重复或早停都会失败关闭根。
- 根取消能够关闭活动 set→exercise，或活动 history，再关闭 transaction；`complete()` 仍只在私有边界后推进物理 EOF并发布四段收据。
- 单元测试新增正常四层提交、history 乱序、history 跳过、history 早停、history 重复、活动 history 取消和活动 set 取消七项；真实集成新增四层 owner/软删除/并发隔离、既有 revision 索引计划和活动 history 取消三项。
- ADR-0160 固定四字段白名单、关系图先行顺序、父级所有权、索引复用和不接入公开 v4 的边界；状态、架构、数据库、训练模型、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 165 轮权威状态、档案和 ADR-0159，检查 `workout_revisions`、同步投影与现有 history API。
2. 确认 `UNIQUE (workout_id,revision)` 和 `(user_id,workout_id,revision desc)` 均为非部分索引，可服务升序 keyset，无需迁移。
3. 将 revision 头白名单限制为身份、动作、序号与变更时间；明确排除完整 snapshot 和父/owner 外键。
4. 让数据库沿 `workout_revisions → workout_sessions` 验证完整所有权链；锚点子查询重复相同 owner/workout 限定。
5. 在第 165 轮三层方法旁新增独立四层方法，保持上一轮内部契约可比较、可回退。
6. 将 history 建模为 workout 的一次性兄弟子流，并用 exercises 已启动/已完成状态拒绝提前读取。
7. 为 history 包装来源生成器：正常 EOF 标记完成；来源错误或提前 `return()` 先关闭局部来源，再发布一次根失败。
8. 根 `fail()` 同时管理活动 set、exercise、history 和 transaction；由于顺序门禁禁止关系图与 history 并发，任何时刻只有一个最深叶来源。
9. 用数据库替身验证四层成功、乱序/跳过/早停/重复以及关系和 history 两类活动取消。
10. 在真实 PostgreSQL 中创建软删除 owner workout、关系图与反序修订；读取首条 history 后并发追加新修订，证明整棵树共享已打开快照。
11. 从 `pg_index` 校验两个 revision 索引无谓词，并对生产实际 revision 页 SQL 执行 JSON 格式 EXPLAIN。
12. 先运行目标 29 项单元、23 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建、格式与生产依赖审计。
13. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、29/29 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、23/23 项通过；本轮没有新增迁移。
- 一条软删除 owner workout 输出一个动作、一个 set 与两条原始 revision；其他 owner 和打开根快照后追加的 revision 均不出现。
- revision 按 `[1,2]` 输出，每项恰好包含 `id,action,revision,changed_at`，不含 `snapshot`、`workout_id` 或 `user_id`。
- PostgreSQL 目录确认父级唯一和 owner/workout/revision 两个索引均非部分；同一实际 revision 页 SQL 的计划命中既有索引。
- 外层结束后 receipt 保持未结算；显式 `complete()` 后分别报告 workout 头 1 批/1 行、动作 1 批/1 行、组 1 批/1 行、修订 2 批/2 行。
- history 乱序、跳过、早停和重复读取分别拒绝根收据；活动 set 与活动 history 取消都保留 lease owner 原错误并关闭根。
- 完整单元为 98 个文件、538/538 项；完整集成为 23 个文件、100/100 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引门禁通过：`docs/` 共 355 份 Markdown，第 090–166 轮与 ADR-0085–0160 连续受保护，待迁移总量保持 191。
- Obsidian 镜像完成写入并逐字节验证：`70,502` 字节，SHA-256 `5ad70d6c98ad20e35b899a78ee9c78bd5117083087995c48a8c1c1c90e9e2c66`；仓库内 `docs/PROJECT_STATUS.md` 继续作为权威副本。

## 5. 发现的问题与经验

- history 是 workout 的兄弟字段，不是 exercise 的子级；但数据库 client 仍是单一根资源，因此必须显式固定 exercises→history 顺序，不能允许两个异步迭代器并发推进。
- 修订头有界不等于修订证据完整。`snapshot` 是不可变事实正文，排除它只能作为过渡架构边界，不能成为公开数据损失。
- 冗余 `workout_revisions.user_id` 不能替代父级所有权。查询和锚点恢复都同时验证父 workout owner、revision owner 与精确 workout，才能在数据异常时失败关闭。
- 降序索引可以反向服务升序读取；在真实生产 SQL 的计划证明通过时，无需为了方向增加重复索引。
- PostgreSQL 多态函数中的测试参数需要显式类型。夹具最初把 UUID/整数参数同时传入 `jsonb_build_object` 时触发类型推断歧义，显式 `::uuid::text` 与 `::integer` 后恢复；这不是生产查询缺陷。
- 关系图、修订头和完整 revision snapshot 是三种不同边界。逐层完成前两者仍不能降低 R-013 或声明训练导出完成。

## 6. 全局状态、项目反思与下一步

本轮把训练当前关系图和纵向修订身份固定到同一个 owner 快照，并让 history 的顺序、背压、收据与取消责任可复现。它消除了“当前关系图与修订头跨快照”的裂缝，但同步导出内存没有下降，history 仍缺少不可变 snapshot 正文。

Inspect → Rank → Improve → Validate 的下一步应解析真实历史 snapshot 的 Schema 差异，在每个 revision 内递归分解 workout/exercise/set 事实。必须先冻结旧版本兼容、标量白名单、父级 position 总序和每元素 64 KiB 门禁，再证明大 snapshot 不作为单 payload 交付、任意深度取消回滚同一根。不得截断、丢弃或调高门禁，也不得把四字段头冒充完整 history；完成前仍不接入公开 v4。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 165 轮档案](165-portable-export-workout-set-layer-lifecycle.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0160](../architecture/decisions/0160-portable-export-workout-revision-header-lifecycle.md)
