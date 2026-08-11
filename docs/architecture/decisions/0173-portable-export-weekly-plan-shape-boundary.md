# ADR-0173：便携归档周计划形状与关联总序边界

日期：2026-08-11

状态：已采纳

## 背景

ADR-0172 已让同步 v4 前八个顶层字段共享一个 active-owner、只读 `REPEATABLE READ` 根。紧随 nutritionFavorites 的 `weeklyPlans` 不是普通表数组：同步投影把当前计划 payload、全部 immutable history、活动与已关闭 workout links、每修订当前体验反思聚合进一个对象。计划内容自身还包含 days/session/activities/options、nutritionFocuses、reasons 和 evidence。

周计划没有软删除，修订与关闭关联必须完整保留。顶层 `(user_id,week_start)`、history `(plan_id,revision)` 和 reflection `(user_id,plan_id,plan_revision)` 都有唯一约束；但同步 workout links 原来只按 `linked_at`，多个关闭关联可共享时间戳，因此不构成总序。现有 link 索引也缺少 UUID 尾列，不能直接支持稳定全历史 keyset。

在决定第九字段前，必须用不泄露正文的真实数据库证据回答：合法当前计划和单 revision 是否低于 64 KiB，history/links/reflections 聚合是否有界，以及各层是否具备可分解结构。

## 决策

1. 新增 `inspectWeeklyPlanShape(userId,planId)`，只在 active-owner、只读 repeatable-read 会话中运行；其他 owner 与不存在计划统一返回 not found。
2. shape 收据只包含当前 revision、三类子集合计数、各层 UTF-8 字节、link 时间戳碰撞数和预期 JSON 结构布尔。不得包含 owner、plan、link、workout UUID 或任何计划正文。
3. 当前 payload 必须检查 `days/nutritionFocuses/reasons` 为数组且 `evidence` 为对象；全部 history snapshot 采用相同结构检查。查询只展开数组计算最大元素字节，不聚合或返回敏感正文。
4. 用共享 `weeklyPlanSchema` 构造 7 天 × 每天 8 个 activities × 每活动 6 个 options 的合法边界夹具；不得用数据库任意 JSON 绕开产品契约来制造超限结论。
5. 同步 workout links 顺序改为 `(linked_at,id)`。迁移 0036 新增非部分 `(user_id,plan_id,linked_at,id)` 索引，服务活动和已关闭 owner 关联的稳定升序 keyset；既有活动部分唯一索引保持不变。
6. 当前 payload 或单 revision 超过 64 KiB 时，不得把 weeklyPlans 作为普通第九字段，不得提高通用 payload 门禁，也不得截断 history 或只导出活动 link。
7. 本轮不输出计划正文，不实现 current/revision 递归来源，不接入第九协调字段，也不修改公开路由、KMS、执行器、下载授权或客户端。

## 影响

- 真实 PostgreSQL 已证明共享 Schema 合法的完整当前 payload 与单条 revision 均可超过 64 KiB；四条 history 和 400 条同时间已关闭 link 的聚合也超过门禁。
- 空 payload 的计划头、单个 day、evidence、单 link 与单 reflection 在该边界夹具中仍低于门禁，为后续递归分层提供了可行方向，但不是全部历史数据的永久容量承诺。
- weeklyPlans 后续必须让当前与 revision snapshot 共享 days/session/activities/options、nutritionFocuses、reasons、evidence 的兼容分解规则，并对 history、links、reflections 分别 keyset。
- `(linked_at,id)` 消除同时刻 link 的不确定表示，迁移 0036 让未来导出查询可使用非部分全历史索引。
- 八字段协调来源与同步公开导出行为保持不变；R-013 仍开放。

这项决定把“是否能安全拆分”与“是否已经完成导出”明确分开。形状收据只用于证明数据规模、父子结构和排序条件，不赋予任何正文读取能力，也不能替代后续逐层门禁。完整实现仍须在同一个所有者快照内依次读取当前计划、修订历史、训练关联和体验反思；父层没有完整结束时不得推进下一层，取消时必须先关闭最深活动来源，再回滚根事务。这样可以防止统计结果被误用为交付结果，也能避免为了满足单行上限而删除、截断或重排用户证据。

后续设计还必须兼顾旧数据。历史快照可能来自较早版本，字段形状与当前生成器并不完全相同；读取方应先验证允许的兼容类别，再决定如何展开，不得静默补写新字段或把未知字段丢弃。每一种兼容类别都需要真实数据库夹具、逐字节对账和提前取消证明，只有这些证据齐全后，计划正文才能进入协调归档。

## 备选方案

### 把完整计划对象作为单个 64 KiB payload

拒绝。共享 Schema 合法当前 payload 与单 revision 已有真实超限反例，会错误拒绝合法 owner 数据。

### 只拆 history，保留当前 payload 整体读取

拒绝。当前 payload 自身也可超过门禁，不能假定只有修订聚合无界。

### 只导出活动 workout links

拒绝。关闭关系是用户所有权与关联更正证据，不能因异步传输方便而丢弃。

### 继续只按 linked_at 排序

拒绝。相同时间戳在模型中合法存在，没有 UUID 尾序就无法稳定分页或逐字节复现同步表示。

### 提高通用门禁

拒绝。它会恢复大单元素 Node 分配，并不能解决无界 history/link 总量。

## 验证

- 共享 Schema 必须接受 7×8×6 边界计划，shape 收据必须证明 current payload 与单 revision 超过 64 KiB。
- 四条 history 和 400 条同时间已关闭 link 必须分别证明聚合超限，且时间戳碰撞数为 399。
- 空 payload 头、最大单日、evidence、单 link 和单 reflection 必须在当前夹具下低于门禁。
- 收据序列化不得包含 secret marker、owner UUID 或 plan UUID；其他 owner 读取必须返回 not found。
- PostgreSQL 目录必须证明迁移 0036 索引无谓词且列顺序精确；实际排序查询计划必须命中新索引。
- schema drift、目标 PostgreSQL、完整单元/集成、strict 类型、生产构建、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0172：便携归档营养收藏第八协调字段](0172-portable-export-nutrition-favorite-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [周计划模型](../PLAN_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 179 轮档案](../../iterations/179-portable-export-weekly-plan-shape-boundary.md)
