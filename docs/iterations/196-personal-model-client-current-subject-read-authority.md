# 第 196 轮：Personal Model 客户端当前主题读取权限

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只实现当前主题客户端严格适配器和页面内存读取权限纯模型。成功正文必须经过共享 Schema 验证并匹配请求 subject；传输、认证、服务和解析失败不能变成空主题。状态必须显式区分未读、首次加载、成功空主题、初始失败、刷新、过期快照；迟到或重复结果、subject 切换和卸载后回调都不能覆盖当前状态。

本轮不新增页面、组件、React hook、自动请求、持久缓存、轮询、后台重试、历史 lineage、证据分页、反馈入口、Weekly Cognitive Review、Personal Model 导出、LLM 或云资源。模块未被页面引用，双端产物不得增长。

## 2. 项目结构、设计、技术与实现功能

- `apps/client/src/lib/api.ts`
  - 新增只接受共享 subject 的 authenticated unknown 传输函数。
- `apps/client/src/lib/personal-model-current-subject-response.ts`
  - 新增无 Taro 依赖的严格响应解析器、专用错误和可注入 transport reader。
- `apps/client/src/lib/personal-model-current-subject-api.ts`
  - 薄绑定真实客户端传输与严格 reader；当前没有页面导入。
- `apps/client/src/lib/personal-model-current-subject-api.test.ts`
  - 覆盖精确空主题、畸形/扩展/subject 错配、transport 参数和错误透传。
- `apps/client/src/lib/personal-model-current-subject-read.ts`
  - 新增显式 unread、启动后五阶段、generation 收据、原子刷新、subject 切换和卸载失效的纯状态转换。
- `apps/client/src/lib/personal-model-current-subject-read.test.ts`
  - 覆盖空主题/失败区分、刷新 stale、迟到/重复结果和清理边界。
- ADR-0190、Personal Model、架构、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 总 API 只负责认证网络请求，返回 unknown。路径 subject 已由 TypeScript 共享联合限制并通过 `encodeURIComponent` 处理，客户端不能传 owner、item 或任意自由查询值。
2. 运行时解析放到不导入 Taro 的独立核心。初版把解析器与真实 API 放在同一文件，Vitest 因 Taro 构建常量缺失无法加载；拆分后核心可在普通测试环境独立验证，平台绑定保持一行 reader 组装。
3. 共享严格 Schema 拒绝未知字段、错版本和畸形 claim；适配层再核对 response subject 等于 request subject，防止合法的其他主题响应被错误接受。
4. transport rejection 原样传播。专用响应错误只用于成功 HTTP 中的无效正文，不读取或拼接服务端原始错误文案，也不把失败降级为空主题。
5. 初始 state 固定 `started:false`，phase 为 unread。begin 后才设置 started/busy 并进入 initial-loading；这样“尚未进入或尚未请求”不会伪装成加载。
6. snapshot 以 `undefined` 表示从未接受成功；其中 `current:null` 仍是完整 snapshot。因此成功空主题进入 ready，初始失败进入 initial-error。
7. 刷新 begin 不清 snapshot，只清上一 failure 并增加 generation。刷新时 phase 为 refreshing；失败时保留 snapshot，记录分类后的 failure 并成为 stale。
8. 每个 begin 返回 subject/generation 收据。accept/fail 只在 state 已启动、仍 busy 且收据精确当前时结算；迟到、重复结算或已关闭收据返回完全相同的 state 引用。
9. accept 还核对 snapshot subject 与当前 state，作为 reader 之外的第二层防线。subject replace 与 invalidate 都增加 generation 并清除 snapshot/failure，旧回调因此失效。
10. 当前不构造 hook 或页面状态副作用；下一轮展示层可复用纯 phase 和 snapshot，但必须显式决定何时 begin/retry/invalidate。

## 4. 验证证据

- 定向客户端适配与读取权限：2 个文件、12 项通过。
- 完整单元测试：110 个文件、661 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、174 项通过。
- 客户端与全工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过预算且与第 195 轮逐字节相同，证明新模块未进入页面产物。
- 本轮不改变 API、数据库或浏览器页面；沿用 44 个迁移、29/174 集成和 95 项浏览器基线，不据此声称存在用户可见 Personal Model 页面。
- 中文文档与迁移索引通过：`docs/` 共 416 份 Markdown，第 090–196 轮 107 份档案与 ADR-0085–0190 106 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像在提交前完成逐字节同步与校验，仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 格式与 Git 差异检查在提交前再次完成。

## 5. 发现的问题与经验

- TypeScript 返回类型不等于运行时响应证明。敏感视图必须从 unknown 解析，并核对请求和响应主题。
- 平台依赖与纯解析应该分层。把 Taro API 和 Schema 解析放在同一文件会让纯测试加载整个平台运行时，也会模糊传输与信任边界。
- “未读”不是“初始加载”。共享五阶段适合已启动请求，但进入时机仍需额外显式状态，否则页面打开前就会看似忙碌。
- 成功空主题是一份证据快照，不是没有 snapshot。用 `snapshot !== undefined` 而不是 `current !== null` 判断读取权限，才能保持空主题与初始失败不同。
- 刷新应原子保留整份旧响应，不拼接字段，也不清空。失败后标记 stale 可以让后续 UI 同时表达旧证据和读取中断。
- generation 还应检查 busy/started。只比较数字和 subject 不能阻止同一收据在已经结算后重复成功或失败。
- subject 切换不能保留旧主题卡片；卸载也不能只设置 mounted boolean。增加 generation 并清空页面证据，让在途回调在纯模型层失权。

## 6. 全局状态、项目反思与下一步

当前主题现在拥有完整但尚未展示的读取链：服务端严格选择/投影/认证/no-store，客户端 unknown 传输后再次严格解析，并用页面内存权限保护首次、刷新、失败和竞态。空主题不会被失败伪造，旧响应也不能覆盖新主题。由于没有页面引用，本轮没有为未完成体验增加包体或路由负担。

下一轮只实现当前主题最小展示组件与纯展示模型：把 subject、claim、状态、反馈、置信限制、证据计数/窗口和时间转换为中性中文；资料不足、用户不同意与终态必须明显，不得生成完成率、依从率、能力评级、好坏判断或建议。组件先以 props 驱动，不接 API 或路由。

页面接线、批量主题列表、反馈命令/界面、lineage/证据分页、Weekly Cognitive Review、Personal Model 便携导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。

## 7. 参考

- [第 195 轮档案](195-personal-model-current-subject-authenticated-http.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0190](../architecture/decisions/0190-personal-model-client-current-subject-read-authority.md)
