# ADR-0154：便携归档同意证据的协调快照

日期：2026-08-11

状态：已采纳

## 背景

第 159 轮已经让健康记录与修订共享一个只读 repeatable-read 事务和 JSON 根生命周期，但 v4 中位于它们之前的 `consentEvents` 仍由同步导出完整组装。隐私同意是解释健康数据为何被收集、处理与导出的关键来源证据；若它与健康当前值、修订历史来自不同提交时刻，同一文件可能出现无法解释的时间裂缝。

现有同步同意查询只按 `accepted_at` 排序。同一时间戳的多条事件没有数据库总序，既不适合作为稳定 keyset，也可能使 eager 与 lazy 输出在重复执行时产生歧义。数据库已经有 `(user_id, accepted_at DESC, id DESC)` 历史索引；在固定 owner 条件下，PostgreSQL 可反向扫描该索引服务升序输出，无需为了方向复制索引。

第 159 轮协调器若继续硬编码两个字段，加入第三个集合会复制状态分支并放大乱序、跳过、清理和收据维护成本。因此本轮需要先抽象顺序集合描述，再增加同意字段，而不是增加第四套独立状态机。

## 决策

1. 新增 `consentEventPageRows()`，按 `(accepted_at, id)` 升序读取 `id,purpose,version,accepted_at,revoked_at`。游标只保存 UUID，完整锚点由同一数据库快照回查。
2. 同意源复用默认 25、最大 100 行批次和最大 64 KiB PostgreSQL UTF-8 payload 门禁；独立入口继续执行 active owner 校验并保留兼容的单集合收据。
3. 同步 v4 导出的同意查询补上 `id` 尾序，使同步与异步投影采用相同确定总序。
4. 不新增迁移。既有 `consent_events_user_history_idx (user_id, accepted_at DESC, id DESC)` 通过反向扫描服务升序 keyset；避免维护语义重复的第二个索引。
5. 把健康双字段状态机重构为私有顺序描述驱动协调器。描述定义集合名与页面源，协调器统一派发行、边界、严格单次顺序消费、分集合收据和失败关闭。
6. 保留 `createHealthHistorySnapshot()` 的双字段兼容入口；新增精确的 `createConsentHealthSnapshot()`，按 `consentEvents`、`healthRecords`、`healthRecordRevisions` 顺序共享一个事务和一次 active owner 校验。
7. 三字段完成后仍不提交。只有外层 JSON 物理 EOF 调用根 `complete()` 才推进数据库 EOF；活动字段、字段间空隙、后续字段、跳过、重复或乱序读取均调用同根 `cancel()` 并回滚。
8. 真实 PostgreSQL 必须证明同时间同意 UUID 总序、跨 owner 排除、第一字段完成后的并发同意/健康新增不进入后续字段、三懒数组与 eager v4 逐字节相同，以及同意与健康字段间取消时健康查询未启动。

## 影响

- 同意来源证据、健康当前事实与修订历史首次可以表示同一个数据库事实时刻，增强便携证据链的可解释性。
- 描述数组成为协调集合顺序的唯一内部来源；增加后续简单集合不再复制整套状态机，但仍必须逐集合证明投影、顺序、容量与隐私边界。
- 同时间事件由 UUID 形成稳定总序；游标不暴露时间或用户内容，数据库仍负责微秒精度比较。
- 同步导出也消除了只按时间排序的歧义，但仍完整组装对象图，本轮不降低同步路径内存。
- 不增加数据库迁移和重复索引，降低写放大；生产查询计划仍需在真实规模和托管 PostgreSQL 中复核。
- 其他十个顶层数组、嵌套聚合和媒体仍未迁移；完整生产投影、KMS、执行器、授权和处置都不存在，R-013 继续开放。

## 备选方案

### 为同意事件复制一套协调器

拒绝。第三套字段索引、边界和清理分支会让已有双字段入口与新入口产生不同语义，后续每迁移一个集合都继续放大状态空间。

### 让同意事件使用独立事务

拒绝。每个集合内部即使一致，也无法证明同意证据与健康事实属于同一个提交时刻。

### 只按 `accepted_at` 排序

拒绝。同时间事件缺少确定尾序，不能形成无重复、无遗漏的稳定 keyset，也不能可靠证明 eager/lazy 字节一致。

### 新增升序同意历史索引

拒绝。B-tree 可反向扫描现有完整降序索引；在没有真实计划证据前增加等价索引只会增加存储和写入成本。

## 验证

- 单元测试必须证明独立同意源的有界批次、payload 收据，以及三集合协调器只建立一个事务、只校验一次 owner、严格按描述顺序消费并在根 EOF 才提交。
- 单元测试必须证明跳过同意字段读取健康字段会失败关闭并回滚。
- 真实 PostgreSQL 必须验证同时间同意按 UUID 排序、其他 owner 不可见，现有历史索引包含所需完整键。
- 第一字段后并发插入的同意、健康记录和修订不得进入当前快照；新快照必须全部可见。
- 三懒数组以 47 字节块输出时必须与 eager v4 逐字节相同；1 字节块在同意与健康之间取消时健康源不得启动，数据库与 JSON 收据必须对象恒等。
- 同步公开导出测试必须把同一用户的同意时间设为相同值，并证明输出 UUID 顺序等于数据库 `(accepted_at,id)` 顺序。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0149：便携归档的只读快照事务与首个 keyset 行源](0149-portable-export-repeatable-read-keyset-source.md)
- [ADR-0151：便携归档数据库 payload 的 UTF-8 交付门禁](0151-portable-export-database-payload-byte-gate.md)
- [ADR-0152：便携归档健康修订的有界 keyset 行源](0152-portable-export-health-revision-keyset-source.md)
- [ADR-0153：便携归档健康历史的同事务根生命周期](0153-portable-export-health-history-root-lifecycle.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 160 轮档案](../../iterations/160-portable-export-consent-coordinated-snapshot.md)
