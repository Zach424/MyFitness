# ADR-0162：便携归档训练修订快照原序递归来源

日期：2026-08-11

状态：已采纳

## 背景

第 167 轮已经用无正文 shape 收据证明单条 `workout_revisions.snapshot` 是否具备安全分解条件，但没有交付正文。把它直接嵌入第 166 轮多 revision history 会同时引入三类尚未证明的责任：JSONB 数组锚点必须无歧义、替换懒数组不能改变对象键顺序、任意深度取消必须先清理活动 set 再回滚根事务。

现有历史快照允许 position 唯一但数组存储反序。未来来源不能按 position 重排；同时，若先删除 `exercises`/`sets` 再追加懒字段，即使数组元素顺序正确，也可能改变 `JSON.stringify` 的对象键序，破坏与当前 v4 的逐字节兼容目标。

## 决策

1. 新增内部 `createWorkoutRevisionSnapshot()`，只处理一个精确 owner/workout/revision，不增加公开路由，也不在本轮嵌入多 revision history。
2. 会话只执行一次 active owner 校验，并让 shape、根、动作和组读取共享一个只读 `REPEATABLE READ` 事务；只有完整读取后显式 `complete()` 才提交。
3. shape 门禁补充 exercise UUID 在 revision 内唯一、set UUID 在父 exercise 内唯一的约束。格式使用规范 UUID 文本结构，不把特定 UUID 版本当成归档兼容条件。
4. 根查询用 `jsonb_set(snapshot,'{exercises}','[]')` 交付空数组骨架，动作查询同理交付 `sets: []` 骨架。Node 只原地替换已有属性为私有懒数组，因此保持 JSONB 解析后的对象键序。
5. exercise 与 set 分别使用 `jsonb_array_elements(... WITH ORDINALITY)` 读取原始数组顺序。应用只保留上一元素 UUID；同一快照内的锚点子查询恢复 ordinality，再读取下一页。
6. 根骨架、动作骨架与单 set 都由 PostgreSQL 编码并执行固定最大 64 KiB UTF-8 门禁。shape 未通过时抛出固定 `portable_export_workout_revision_snapshot_not_decomposable`，不查询根正文。
7. snapshot、exercise 与 set 都必须恰好一次且完整读取。跳过、重复、提前停止或主动取消先关闭最深活动 set，再关闭 exercise 和根事务；统一收据只在提交后发布 shape 和三层批次/行数。
8. 跨 owner、错误 workout 或不存在 revision 统一为 `workout revision snapshot not found`。错误和收据不包含账号、workout/revision UUID 或训练正文。
9. 本轮不修改迁移、同步下载、公开 v4、归档协调器、KMS、租约执行、下载授权或客户端入口。第 166 轮 history 仍只含修订头。

## 影响

- 单 revision snapshot 可以在不把完整 JSONB 交给 Node 的情况下逐层读取，并以真实 PostgreSQL 证明与直接读取的 JSONB 逐字节重建等价。
- UUID 唯一性成为 ordinality 锚点的可执行先决条件；重复 exercise/set UUID 会在正文交付前失败关闭。
- 空数组占位加原地替换同时保留对象键序和数组原序，避免只关注 position 或数组顺序造成隐蔽字节差异。
- 数据库仍会为 shape 和各页展开 JSONB；本决策限制数据库到 Node 的单元素交付，不声称限制 PostgreSQL 内部计算成本。
- 多 revision history、完整 workout v4 和同步导出内存仍未完成，R-013 保持开放。

## 备选方案

### 直接删除数组键并在 Node 末尾追加

拒绝。这样会移动 `exercises`/`sets` 的对象键位置，无法证明与现有 JSONB 解析结果逐字节一致。

### 直接保存 ordinality 数字作为公开游标

拒绝。ordinality 是内部表示位置，不应进入收据或公开协议；同一只读快照内用元素 UUID 恢复位置即可保持最小状态。

### 同一轮直接改造多 revision history

暂缓。先独立证明单 revision 的字节、锚点和最深层取消，使下一轮 history 组合只承担父子生命周期连接，而不混入底层表示问题。

### 允许重复 UUID 并改用 position 锚点

拒绝。position 虽唯一但不是不可变数组顺序；用它分页会重排合法反序历史。

## 验证

- 目标数据库快照单元测试必须为 35/35 项通过；真实 PostgreSQL 文件必须为 29/29 项通过。
- 合法 `[2,1]` exercise/set position 快照必须按 JSON ordinality 输出，并与直接读取的 JSONB `JSON.stringify` 逐字节相同。
- 批次为一行时，两动作三组必须报告根 1/1、动作 2/2、组 3/3 批次/行数。
- 重复 exercise UUID、重复同父 set UUID、未知字段和超限元素必须令 shape 不可分解；正文来源必须返回固定无内容错误。
- 跨 owner 必须与不存在 revision 返回相同 not-found。
- 活动 set 取消必须先结束 set/exercise，再以同一错误拒绝根和收据。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0160：便携归档训练修订头同根顺序生命周期](0160-portable-export-workout-revision-header-lifecycle.md)
- [ADR-0161：便携归档训练修订快照形状收据](0161-portable-export-workout-revision-snapshot-shape-receipt.md)
- [训练记录模型](../WORKOUT_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 168 轮档案](../../iterations/168-portable-export-workout-revision-snapshot-ordinality-source.md)
