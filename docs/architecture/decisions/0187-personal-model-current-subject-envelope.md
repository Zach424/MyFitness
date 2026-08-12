# ADR-0187：Personal Model 当前主题严格内部信封

日期：2026-08-12

状态：已采纳

## 背景

第 191 轮允许同一 owner/subject 永久保留多个 generation，第 192 轮完成首批第三个严格 claim。现有 `getCurrent(userId,itemId)` 能读取明确 item 的当前 revision，却要求调用方先知道 item ID；若后续回顾、API 或客户端自行按 generation 最大值、最新时间或非终态状态猜测当前 item，就可能把历史代、尚未退役的终态代或其他 owner 的条目误当当前事实。

数据库已有 `(user_id,subject_key) WHERE retired_at IS NULL` 部分唯一索引，但索引本身不是调用契约。读取还必须明确 active owner、无主题、终态与退役的差异，并把 item 元数据和精确 current revision 放在同一一致性边界。本轮只建立内部读取原语，不扩大到 HTTP、完整 lineage、证据分页或 UI。

## 决策

1. 新增共享 `personal-model-current-subject-envelope-v1`。顶层固定 `ownerUserId`、严格 `subjectKey` 和可空 `current`；空主题只能返回 `current:null`，不能虚构 item 身份或 Unknown claim。
2. 非空 `current` 同时携带 `itemId`、正整数 `generation`、直接 `predecessorItemId`、`terminal`、`retiredAt:null` 和完整 `personal-model-item-revision-v1`。
3. 第一代必须没有前代，后续代必须有不同于自身的前代。item ID、revision owner、revision item 与 revision subject 必须分别匹配信封；`terminal` 只能由 current revision 的 `superseded` 或 `invalidated` 状态推导。
4. `terminal` 与 retired 是独立概念。终态 item 在出现合格后继之前仍是当前代，所以允许 `terminal:true` 与 `retiredAt:null`；已经退役的历史代不会出现在当前信封。
5. repository 新增 `getCurrentSubject(userId,subjectKey)`。输入先由共享 Schema 验证；数据库读取使用一条语句，从 active `users` 出发，按同 owner/subject 左连接唯一未退役 item，再连接该 item 的精确 current revision。
6. active owner 存在而主题不存在时返回明确空信封。owner 不存在或非 active 使用专用 authority 错误；重复行、owner 不匹配、空主题夹带元数据、非空代缺少 revision 或任何共享 Schema 不一致均失败关闭。
7. repository 不以 `ORDER BY ... LIMIT 1` 掩盖歧义，也不降级选择 generation 最大值、最新时间、非终态 item 或任意 revision。单元测试模拟重复结果，证明即使数据库约束失守也不会任取一行。
8. 当前读取不新增迁移。既有部分唯一索引与复合外键继续提供数据库第一层防线，共享 Schema 与 repository 行数/完整性校验提供第二层防线。
9. 本轮不开放 HTTP，不定义认证错误隐藏、公开字段最小化、缓存头、lineage/证据分页、便携模型导出、Weekly Cognitive Review 或客户端状态机。

## 影响

- 后续服务不再需要先列出 items 或猜测 item ID，能够以一个严格原语读取某个主题当前可审计的 generation。
- item 代际元数据与完整 current revision 同语句取得，避免分两次读取时 item 指针或换代发生变化造成撕裂组合。
- 明确空结果区别于 owner authority 失败，也区别于存在但 candidate/disputed/terminal 的条目；调用方不能把缺少主题解释为零行为。
- 信封仍包含完整内部 revision 和证据引用，不适合原样暴露。下一层必须做用户可见字段最小化和授权错误设计。
- active owner 门禁意味着 disabled/deletion_pending 账号不获得普通读取；账户删除仍由既有级联语义处理。

当前信封只证明数据库在该语句快照中存在唯一未退役代及其精确 revision，不证明 claim 正确、完整、实时、用户同意或适合驱动建议。terminal 只表示生命周期状态，不能被展示为失败、违规或健康判断。

## 备选方案

### 让调用方先列出 item 再调用 `getCurrent`

拒绝。选择逻辑会在多个调用方重复，并在两次数据库读取之间产生换代竞态。

### 取最大 generation 或最新 `updated_at`

拒绝。排序加 `LIMIT 1` 会隐藏重复当前代或损坏 lineage；最新时间也不等于未退役当前语义。

### 只返回 revision，不返回代际元数据

拒绝。调用方无法解释第一代/后继、终态当前与历史退役的差异，后续又会查询或猜测 item 表。

### 把终态直接视为空主题

拒绝。终态当前代仍是需要解释的历史结论，并可能等待新证据形成后继；隐藏它会丢失纠正和审计上下文。

### 本轮同时开放公开 API

拒绝。内部完整 revision 含敏感证据引用，公开投影、认证错误隐藏、缓存和分页需要独立验收，不能由 repository 返回类型替代。

## 验证

- 共享契约测试覆盖正常第一代、终态未退役后继、明确空主题，以及 owner/subject/item/前代/terminal/retired 不一致拒绝。
- repository 单元测试模拟数据库返回两个当前行，证明单语句调用一次且歧义失败关闭。
- 真实 PostgreSQL 测试覆盖 active owner 空主题、缺失/停用 authority、非法 subject、双 owner 同主题隔离、不同 subject 不替代、终态当前代和 generation+1 后继选择。
- 完整单元、集成、typecheck、H5/API/admin 与 WeApp 构建、生产依赖审计、双端体积、迁移、中文文档、Obsidian 和 Git 差异门禁必须通过后提交。

## 关联

- [ADR-0185：Personal Model 同主题条目代际生命周期](0185-personal-model-item-generation-lifecycle.md)
- [ADR-0186：已记录训练课次时长确定性基线](0186-recorded-session-duration-deterministic-deriver.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 193 轮档案](../../iterations/193-personal-model-current-subject-envelope.md)
