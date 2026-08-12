# ADR-0189：Personal Model 当前主题认证只读 HTTP

日期：2026-08-12

状态：已接受

## 背景

ADR-0187/0188 已固定当前主题内部信封和 owner-free 最小可见投影，但应用服务尚未形成可调用接口。公开读取必须绑定现有会话主体、只允许三个已实现的严格主题，并让空主题、认证失败、读取期间 authority 变化与内部数据故障拥有不同语义。由于响应包含敏感行为推导，禁止缓存必须覆盖成功、参数失败、认证失败、不可用和内部故障，而不只是进入控制器后的 200。

本轮只开放一个当前主题读取，不同时扩张客户端、历史代、证据明细、反馈命令、Weekly Cognitive Review 或模型导出。接口必须继续复用共享 Schema 和应用投影，不得在控制器中重新拼装数据库对象。

## 决策

1. 开放 `GET /v1/personal-model/subjects/{subjectKey}/current`。控制器位于 `personal-model` 标签和现有 `@Auth()` Bearer guard 下，不接受 owner、item 或 revision 查询参数。
2. `subjectKey` 通过共享 `personalModelSubjectKeySchema` 解析，只允许 training availability、recorded training frequency、recorded session duration 三个严格主题；非法值在 repository 访问前返回结构化 400。
3. 200 响应再次通过 `personalModelCurrentSubjectViewSchema` 解析。active owner 尚无该主题时返回相同 subject 与 `current:null`；非空结果只包含 ADR-0188 的白名单字段。
4. 缺少或无效 Bearer 由现有 Session guard 返回 401。guard 只接受 active user 的未撤销、未过期会话，因此通常不会把不存在或非 active owner 交给控制器。
5. 若 owner 在 guard 认证与 repository 读取之间失去 authority，应用服务产生的统一 unavailable 只映射为无正文身份线索的 404。响应不得说明 owner 不存在、disabled 或 deletion_pending。
6. 数据库歧义、残缺、Schema 损坏和非 authority 错误不映射为 404 或空主题，继续由 Nest 形成不含内部错误正文的 500。
7. 路径级前置中间件在 guard 运行前设置 `Cache-Control: private, no-store`。因此 200、400、401、404 和 500 均禁止缓存；方法级 Header 保留为控制器元数据和防御性声明。
8. OpenAPI 固定 Bearer security、三个路径枚举、严格 200 Schema，以及 400/401/404/500 响应。路径存在与响应集合必须由自动测试锁定。
9. 真实 PostgreSQL 集成测试必须使用两个已认证 owner，证明一个 owner 的当前 item 不会出现在另一个 owner 的响应；响应还需拒绝 user ID、revision UUID、references 和 fingerprint。
10. 本轮不新增迁移、持久状态、客户端缓存、轮询或事件推送。读取仍使用 ADR-0187 的单条 PostgreSQL 语句快照。

## 影响

- 调用方现在可以用认证会话和一个严格主题读取当前最小认识，不再需要猜 item ID 或访问内部仓储。
- 路径不暴露 owner 参数，所有者只能来自服务端会话；第二 owner 的相同主题不会越权返回第一 owner 的内容。
- 空主题仍是成功的领域结果，和 404 authority 竞态、401 认证失败、500 内部故障互不混淆。
- 前置 no-store 关闭了 guard 早退响应缺少缓存头的漏洞；仅使用控制器 `@Header` 不能覆盖未认证 401。
- 接口只提供当前代摘要，不能据此浏览历史、证据正文或完整个人模型，也不能驱动自动建议。

该路由公开的是有限记录形成的一项当前派生认识，不证明记录完整、结论正确、用户确认、趋势改善或适合医疗、训练和饮食处方。

## 备选方案

### 使用查询参数接受任意 subject 字符串

拒绝。任意字符串会扩大未来内部主题枚举面，也可能产生 fallback 或自由查询“用户画像”。

### 使用 owner ID 作为路径参数

拒绝。当前产品只有本人读取，owner 必须来自服务端会话；路径 owner 会增加越权和枚举风险。

### authority 不可用返回空主题

拒绝。它会把认证后状态竞态伪装成没有认识，也让客户端保存错误的空快照。

### 所有失败都返回 404

拒绝。非法参数、缺少认证和数据损坏需要不同处理；尤其不能用 404 隐藏数据库一致性故障。

### 只使用控制器 `@Header` 设置 no-store

拒绝。Session guard 在控制器之前运行，未认证 401 不会获得方法级 Header；敏感路径需要前置中间件。

### 本轮同时接入客户端

拒绝。客户端还需要独立的五阶段读取权限、严格解析、过期快照和重试语义，不能把首次 API 可用直接等同于可靠页面状态。

## 验证

- 控制器单元测试覆盖正常解析、非法 subject、unavailable → 404 与内部 conflict 透传。
- OpenAPI 测试锁定路径、Bearer、三值枚举和 200/400/401/404/500。
- 真实 HTTP/PostgreSQL 测试覆盖无 Bearer 401、非法 subject 400、空主题 200、统一 unavailable 404、内部冲突 500、非空当前 item 与双 owner 隔离；五种状态全部断言 `private, no-store`。
- 完整单元测试 108 个文件、649 项通过；完整集成测试 29 个文件、174 项通过。
- typecheck、H5/API/admin/WeApp 构建、客户端体积、生产依赖、44 个迁移、六张 Personal Model 表清理、中文文档、Obsidian 与 Git 差异门禁通过后提交。

## 关联

- [ADR-0187：Personal Model 当前主题严格内部信封](0187-personal-model-current-subject-envelope.md)
- [ADR-0188：Personal Model 当前主题最小可见投影](0188-personal-model-current-subject-visible-projection.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [接口参考](../../api/API_REFERENCE.md)
- [第 195 轮档案](../../iterations/195-personal-model-current-subject-authenticated-http.md)
