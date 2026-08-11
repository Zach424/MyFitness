# ADR-0161：便携归档训练修订快照形状收据

日期：2026-08-11

状态：已采纳

## 背景

第 166 轮已把 revision 头放入 workout 当前关系图的同一根事务，但不可变 `snapshot` 仍是完整 JSONB 对象。直接把 snapshot 当作单 payload 会重新引入超过 64 KiB 的交付；在没有验证历史形状前递归拆分，也可能把旧快照的可选动作字段误判为损坏，或按 position 重排原始 JSON 数组而改变历史证据。

现有 Workout 契约只要求 exercise/set position 在父级内唯一，不要求调用方按 position 排列输入数组。服务端历史写入保存接受对象的数组顺序，因此旧快照可以“position 唯一但存储顺序反向”。不可变历史的表示顺序应由 JSON 数组 ordinality 保留；position 继续作为用户确认的事实，而不是重写历史的排序依据。

## 决策

1. 新增内部 `inspectWorkoutRevisionSnapshotShape()`，在一次 active-owner、只读 `REPEATABLE READ` 事务中检查一个精确 owner/workout/revision UUID，不增加公开路由。
2. 固定 `myfitness-portable-export-workout-revision-snapshot-shape/v1` 收据，只返回 revision 数字、兼容类别、根/动作/组字节上界、元素计数、存储顺序是否与 position 一致及 `decomposable`；不返回 user/workout/revision UUID、标题、动作名、备注或其他正文。
3. 根 snapshot 必须恰好包含历史 Workout 根键，并且 snapshot 的 `id`、`userId`、`revision` 必须与受 owner 约束的数据库父链一致。
4. 动作允许初始字段和后续可选 `trackingMode/equipment/equipmentNotes`；按是否出现这些扩展键把单 revision 分类为 `legacy`、`extended` 或 `mixed`。可选字段缺失不等于损坏。
5. 动作与组都必须是对象数组，包含分解所需键、没有未知键，并满足父级数量与 position 唯一约束。shape 收据不重新执行完整健身领域值校验。
6. PostgreSQL 使用 `jsonb_array_elements(... WITH ORDINALITY)` 检查实际存储顺序，并分别报告 exercise/set 存储顺序是否与 position 升序一致。下一轮递归游标必须使用 ordinality，不能重排不可变数组。
7. PostgreSQL 只计算根头、最大动作头和最大单组的 UTF-8 字节数；任一元素超过 64 KiB 时 `decomposable=false`，但收据仍不返回正文。
8. 未知根/子字段、缺失必需键、父级身份不一致、无效数组、重复 position 或超限元素均失败关闭“可分解”结论，不得静默丢字段、截断或提高门禁。
9. 跨 owner、错误 workout 或不存在 revision 统一返回内部 not-found；非 active owner 仍由根账号门禁拒绝。
10. 本轮不流出 snapshot 元素、不接入第 166 轮 history 生命周期或公开 v4，也不改变同步下载、迁移、路由、KMS、执行器、授权或客户端入口。

## 影响

- 下一轮递归拆分获得可执行的历史兼容与字节前置条件，而不是仅依赖当前 TypeScript 类型假设。
- 旧版、扩展版和混合动作字段可以无正文分类；可选字段演化不会被误报为数据丢失。
- position 与存储顺序的差异成为显式收据事实，避免“为了看起来有序”而改写不可变历史。
- shape 收据只检查能否安全拆分，不证明完整 Workout 领域值仍符合今天的所有规则。
- 同步导出内存没有下降，完整 snapshot 仍未流式交付，R-013 保持开放。

## 备选方案

### 直接用当前 `workoutSchema` 解析完整 JSONB

拒绝作为归档路径。它要求完整 snapshot 先进入 Node，不能提供数据库→Node 字节边界，也无法证明超限正文未交付。

### 按 position 排序后再递归输出

拒绝。契约允许唯一但反序的输入数组，历史保存的是原始数组顺序；重排会改变不可变证据。

### 只接受当前扩展字段形状

拒绝。早期合法 snapshot 没有 tracking/equipment 字段；可选演化不能成为历史不可导出的原因。

### 遇到未知字段时忽略

拒绝。静默忽略会丢失未来或异常历史证据。未知形状必须先标记不可分解，再显式升级兼容规则。

### 在收据中返回字段名或对象 ID 便于调试

拒绝。shape 收据用于安全门禁，只需要布尔、计数、分类和字节数；标识与正文会扩大敏感诊断面。

## 验证

- 目标数据库快照单元测试必须为 31/31 项通过；真实 PostgreSQL 文件必须为 26/26 项通过。
- 当前扩展形状必须报告 2 个动作/2 个组、`extended`、顺序匹配且 `decomposable=true`，收据中不得出现秘密动作名或 UUID。
- 合法旧形状的动作与组数组即使 position 反序，仍必须报告 `legacy` 与 `decomposable=true`，同时两个顺序标志为 false。
- 混合旧/新动作字段必须报告 `mixed`；未知根字段必须把 `decomposable` 置为 false。
- 单动作头超过 64 KiB 时必须只报告最大字节数与 `decomposable=false`，不得返回正文。
- 跨 owner 读取必须返回与不存在 revision 相同的 not-found。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [ADR-0160：便携归档训练修订头同根顺序生命周期](0160-portable-export-workout-revision-header-lifecycle.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 167 轮档案](../../iterations/167-portable-export-workout-revision-snapshot-shape-receipt.md)
