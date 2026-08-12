# ADR-0190：Personal Model 客户端当前主题读取权限

日期：2026-08-12

状态：已接受

## 背景

ADR-0189 已开放当前主题认证只读 HTTP，但客户端还没有严格适配和状态权限。若页面直接把 API 泛型断言成共享类型，畸形或扩展响应可能进入 UI；若只用 `data === undefined` 判断加载，读取前、初始失败和成功空主题容易混淆。刷新失败还可能清空已经接受的敏感快照，迟到请求可能覆盖更新的主题或页面状态。

本轮只建立可复用的客户端读取基础，不接入页面。它必须维持空主题、失败、刷新过期与未读取的区别，使用页面内存而非持久缓存，并保证切换 subject 或卸载后旧异步结果无权写回。

## 决策

1. 在客户端总 API 中新增薄传输函数，只接受共享 `PersonalModelSubjectKey`，对路径段编码并复用现有 authenticated request；返回类型保持 unknown，不能以 TypeScript 泛型替代运行时验证。
2. 无平台依赖的响应核心使用共享 `personalModelCurrentSubjectViewSchema` 解析，并额外要求响应 subject 与请求 subject 相同。畸形、未知字段、版本错配或 subject 错配统一抛专用无敏感正文错误。
3. reader 由可注入 transport 构造。HTTP、认证和网络错误保持原样抛出，不转换为 `current:null`；只有严格解析成功的空视图才是空主题。
4. 页面内存状态在任何请求开始前显式为 `unread`。读取开始后才复用共享的 `initial-loading`、`ready`、`refreshing`、`initial-error`、`stale` 五阶段。
5. 成功空主题是拥有 snapshot 的 `ready`，不是无快照。初始失败保持无 snapshot 的 `initial-error`；刷新开始保留整份旧 snapshot，刷新失败只增加 failure 并进入 `stale`。
6. 每次 begin 单调增加 generation 并返回绑定 subject/generation 的收据。只有 subject 和 generation 都匹配、state 已启动且仍 busy 的收据可以成功或失败结算；迟到、重复或已失效收据全部返回原 state 引用。
7. success 还必须要求 snapshot subject 等于当前 state subject，防止 transport 或调用方把另一主题的合法响应写入当前视图。
8. subject 切换增加 generation，设置新 subject，并清除 started、busy、snapshot 和 failure；卸载/关闭的 invalidate 同样增加 generation、清除全部页面证据，使在途结果失效。
9. 本轮不提供 React hook、不发起自动请求、不持久化、不轮询、不后台重试。未来 hook 必须使用这些纯转换，而不是复制一套状态机。
10. 适配和状态模块尚未被任何页面导入；生产 H5/WeApp 产物必须保持与上一轮逐字节测量相同。

## 影响

- 客户端不会因静态类型断言信任服务端正文，服务端 Schema 漂移或 subject 错配会在展示前失败。
- 读取前、加载、成功空主题、初始失败、刷新和过期快照拥有不可混淆的状态，页面无需用空对象或 null 猜测权限。
- 刷新失败不会清空已接受认识，也不会把旧快照与新失败拼成伪成功；UI 后续可以明确标注过期并允许显式重试。
- generation 收据关闭旧请求覆盖新请求、切换主题后写回、卸载后写回与同一收据重复结算。
- 当前模块只提供能力，不产生用户可见界面，也不会增加已有页面包体。

这些读取权限只保护传输和页面状态，不证明 claim 正确、完整、当前有效或适合建议。后续展示仍必须用中性文案解释限制和证据范围。

## 备选方案

### 在 API 泛型中直接返回共享类型

拒绝。泛型不会验证运行时正文，未知字段、版本漂移和 subject 错配会静默进入页面。

### 将 404 或解析失败视为空主题

拒绝。404 表示 authority 不可用，解析失败表示契约异常；两者都不能变成持久或可见的“没有认识”。

### 只使用共享五阶段，不增加 unread

拒绝。共享函数在没有 snapshot/busy/failure 时返回 initial-loading，会把尚未发起请求误标成正在加载；当前功能需要显式进入时机。

### 刷新时先清空 snapshot

拒绝。网络失败会造成已接受敏感证据突然消失，也无法区分空主题和刷新中断。

### 仅用 mounted boolean 忽略迟到结果

拒绝。mounted 不能解决同一页面的并发刷新或 subject 切换；generation + subject 收据提供精确权限。

### 本轮直接新增 React hook 和页面

拒绝。纯适配与状态转换需要先独立验证，展示文案和无障碍语义是下一轮单独范围。

## 验证

- 适配器测试覆盖精确空主题、畸形/扩展/subject 错配拒绝、transport 参数和错误透传。
- 状态测试覆盖 unread、初次加载、初始失败、成功空主题、刷新、stale、迟到成功/失败、重复结算、subject 切换与卸载失效。
- 定向 2 个文件、12 项通过；客户端 typecheck 通过。
- 完整单元测试 110 个文件、661 项通过；完整 PostgreSQL 集成测试 29 个文件、174 项通过；工作区 typecheck 通过。
- H5/API/admin/WeApp 构建、客户端体积、生产依赖、中文文档、Obsidian 和 Git 差异门禁通过后提交；本轮没有迁移，沿用 44 个已核验迁移。

## 关联

- [ADR-0188：Personal Model 当前主题最小可见投影](0188-personal-model-current-subject-visible-projection.md)
- [ADR-0189：Personal Model 当前主题认证只读 HTTP](0189-personal-model-current-subject-authenticated-http.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [第 196 轮档案](../../iterations/196-personal-model-client-current-subject-read-authority.md)
