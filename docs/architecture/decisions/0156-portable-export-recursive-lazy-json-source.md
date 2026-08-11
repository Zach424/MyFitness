# ADR-0156：便携归档递归懒 JSON 来源契约

日期：2026-08-11

状态：已采纳

## 背景

第 156 轮让 v4 的顶层数组字段可以使用私有懒节点，运行时 `jsonTokens()` 从一开始就是递归的，因此嵌套对象内遇到同一节点也能正确编码。但 `PortableExportJsonSource` 的 TypeScript 类型只放宽 `data` 下的顶层数组；workout 对象内的 exercises、sets 和 history 无法在不绕过类型系统的情况下声明懒来源。

第 161 轮证明合法 30×50 当前训练已经超过单 payload 门禁，后续必须分层。若运行时能力与静态来源契约继续不一致，数据库组装器要么使用不安全断言，要么建立另一套 JSON 表示；两者都会削弱 strict mode 和字节兼容证据。

递归能力还需要独立验证取消次序。最外层 JSON 停止时，活动内层 iterable 必须先收到 `return()`，随后根生命周期才回滚数据库事务；仅验证顶层健康数组不足以证明训练 sets 的嵌套链。

## 决策

1. 新增导出的递归条件类型 `PortableExportJsonValue<Value>`。字符串、数字、布尔和 null 保持原类型；对象保留每个键并递归映射；数组可选择递归 eager 数组或 `PortableExportJsonAsyncArray`。
2. `PortableExportJsonSource` 定义为 `PortableExportJsonValue<PrivacyExport>`，因此根 Schema 字段、必填项和非数组形状仍由 `PrivacyExport` 决定，懒能力只在 JSON 树的数组节点扩展。
3. 私有 `unique symbol` 标记和 `portableExportJsonAsyncArray()` 工厂保持不变。运行时继续只识别显式 wrapper，不把任意 `Iterable`/`AsyncIterable` 业务对象自动视为数组。
4. JSON token、缩进、转义、UTF-8 分块、maximumBytes、SHA-256 和根生命周期实现不修改；本轮是把已存在的递归运行语义提升为 strict 类型契约。
5. 单元测试使用 workout 形状：顶层 workouts 保持 eager，每个 workout 的 exercises 与 history 为懒数组，每个 exercise 的 sets 也是独立懒数组。输出必须与同形 eager v4 逐字节相同。
6. 测试在读取首个 JSON 块后必须证明三类嵌套来源均未启动，完整消费后分别精确读取 2 个动作、3 组和 2 条修订。
7. 取消测试以 1 字节块推进到首个 set 后停止；活动 sets 的 `finally` 必须先执行，根 `cancel(error)` 随后收到统一未完成错误，根 `complete()` 不得运行。
8. 本轮不增加 workout 数据库查询、迁移、索引、协调字段或公开功能，也不改变同步 HTTP 导出。

## 影响

- 未来训练分层组装器可以在 strict TypeScript 下表达对象内懒 exercises/sets/history，不需要 `as unknown` 绕过来源契约。
- eager `PrivacyExport` 继续可直接传入；公开 v4 Schema 和字节格式保持完全兼容。
- 活动内层取消已形成可复现顺序：先关闭最近的懒来源，再取消文件根，为后续同事务数据库清理提供连接点。
- 条件类型只扩展数组节点，不允许函数、undefined、bigint 或任意非 JSON 值进入来源。
- 本轮没有减少同步导出对象图，也没有实现 workout 数据库背压；R-013 继续开放。

## 备选方案

### 在 workout 组装器中使用类型断言

拒绝。断言会掩盖来源形状错误，使 strict mode 无法证明嵌套节点位于合法数组位置。

### 为 workout 单独定义第二套编码器

拒绝。它会复制缩进、转义、大小门禁、摘要和取消逻辑，增加 v4 字节漂移风险。

### 把所有对象都放宽为通用未知映射

拒绝。根字段和非数组值会失去 `PrivacyExport` 约束，扩大内部序列化攻击面。

### 只测试嵌套成功，不测试取消

拒绝。训练分层的主要风险之一就是停止时仍持有 sets 查询或根事务；成功字节相同不能证明资源关闭。

## 验证

- 目标 JSON 单元测试必须为 11/11 项通过，并由显式 `PortableExportJsonSource` 变量编译嵌套 wrapper。
- 首块输出后 exercises/sets/history 请求计数必须全部为零；完整消费后计数必须为 2/3/2。
- 29 字节块的嵌套 lazy 输出、长度和 SHA-256 必须与 eager `serializePortableExport()` 完全相同。
- 1 字节取消必须停在首个 set，关闭活动内层来源后再调用根 cancel；完成回调不得执行，收据错误与取消错误必须对象恒等。
- 完整单元、集成、strict 类型、生产构建、格式、依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0147：便携归档的增量 JSON 字节源](0147-portable-export-incremental-json-byte-source.md)
- [ADR-0150：便携归档 v4 JSON 的可组合异步数组](0150-portable-export-composable-async-json-arrays.md)
- [ADR-0153：便携归档健康历史的同事务根生命周期](0153-portable-export-health-history-root-lifecycle.md)
- [ADR-0155：便携归档训练聚合的嵌套边界](0155-portable-export-workout-nested-boundary.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 162 轮档案](../../iterations/162-portable-export-recursive-lazy-json-source.md)
