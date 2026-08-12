# 第 200 轮：Personal Model 精确修订反馈 HTTP

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只实现当前 Personal Model 条目的本人反馈认证 HTTP。四个既有选择必须绑定登录 owner 与路径中的精确 `itemId + revision`，服务端在同一行锁事务内生成完整反馈转换，并且只返回最小 revised/no-op 收据。过期、终态、跨 owner、失效账户、同 event 换内容和响应丢失重放必须失败关闭或安全收敛；所有状态必须 `private, no-store`。

本轮不接客户端按钮，不实现备注编辑、自动刷新、历史、lineage、证据正文、Weekly Cognitive Review、模型导出、LLM、计划调整、迁移或云资源。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model.*`
  - 新增公开请求/响应版本、严格 Schema 与类型；请求排除 owner/目标/时间/结果，响应排除 claim、证据、备注、理由和内部指纹。
- `apps/api/src/personal-model/personal-model-feedback.ts`
  - 新增四选一确定性转换、no-op 判定、disputed 恢复、结果指纹和最小响应投影。
- `apps/api/src/personal-model/personal-model-feedback.service.ts`
  - 只分配服务器接受时刻并调用仓储 command，不接收客户端身份或结果对象。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增 owner authority 锁、item/current 行锁内 command、persisted event 重放核对和共享事务持久 helper。
- `apps/api/src/personal-model/personal-model.controller.ts`
  - 新增认证 POST 路由、400/404/409/500 映射、严格路径/正文解析和最小响应复核。
- `apps/api/src/app.module.ts`
  - 写路由加入前置 no-store 中间件，确保认证 guard 拒绝也不被缓存。
- `apps/api/src/**/*personal-model*test.ts`、`apps/api/src/openapi.test.ts`
  - 新增契约、领域映射、控制器、OpenAPI、HTTP/PostgreSQL 并发、权限、重放与公开字段测试。
- `docs/api/openapi.json`
  - 重新生成机器契约，包含精确路径参数、请求/响应和五类失败状态。
- ADR-0194、Personal Model、架构、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 客户端只生成 event UUID 和反馈内容；Bearer principal、item/revision 路径、服务器接受时刻和结果 revision 分属不同权限，不在一个可伪造正文中混合。
2. command 先以 `FOR SHARE` 锁定 active owner，再锁 item 当前指针并重新读取 current revision；账号删除/停用无法在反馈事务中途越过权限。
3. item 锁内先查同 event 持久结果。精确请求重放直接返回首次事件的接受时刻和结果；换 choice/reason/note/有效期则冲突。
4. 新事件只在 current revision 等于路径 revision、条目非终态、接受时刻不早于当前修订、temporary 截止仍在未来时构造。
5. 四项 choice 只改变反馈状态、必要的 disputed/status、temporary 有效期和 `user_disputed` 限制，不改 claim、证据、置信数值或来源。
6. 相同反馈状态是 no-op 的必要条件；temporary 还要求有效期完全相同，disagree 还要求条目已 disputed。no-op 保存 event 收据但不生成 revision。
7. 新 command 与原内部 `applyFeedback()` 复用一个持久 helper，避免 SQL 和延迟外键关系出现两套实现。
8. 公开响应由完整内部 transition 投影生成，只含写入确认所需定位和状态。reason/note 虽入追加账本，但不回显、不进日志、不进入错误正文。
9. HTTP 目标测试先验证真实数据库，再跑全仓门禁；新增独立数据库夹具避免改变既有长历史测试的修订时间线。

## 4. 验证证据

- 公开契约、领域反馈、控制器与 OpenAPI 定向：4 个文件、44 项通过。
- PostgreSQL/HTTP 定向：2 个文件、22 项通过。
- 完整单元测试：116 个文件、709 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、176 项通过。
- 全工作区 strict typecheck 通过；API、管理端、contracts、domain 和生产 H5 构建通过；生产 WeApp 单独构建通过。
- 客户端质量：H5 总量/入口/最大异步块 1,250,867/315,456/149,898 字节；WeApp 总量/vendor/最大页面 1,149,735/19,338/56,943 字节；预算未提高，禁止标记为零。
- production audit high 门禁通过；仍为 0 个 critical/high、9 个已登记 moderate。
- OpenAPI 重新生成并由测试锁定 POST 路径、Bearer、requestBody 和 200/400/401/404/409/500。
- 中文、迁移索引、链接、格式、Git 差异与 Obsidian 门禁在提交前完成。

## 5. 发现的问题与经验

- 内部反馈事务接收的是已完成 transition，不能原样暴露给 HTTP。公开 command 必须在锁内从最小输入生成 transition，才能同时守住身份和并发。
- 幂等事件应恢复首次持久收据，而不是用重试时的服务器时间重建结果；否则响应丢失重试会因 createdAt 不同而错误冲突。
- 查询 persisted event 仍要在 item 锁内进行。这样同事件并发请求先串行，再由后到者读取已提交收据，数据库只保留一个事件和最多一个结果修订。
- no-op 不是“不写数据”。追加一条无修订事件收据才能区分“已经接受但无需改变”和“请求从未到达”。
- 反馈选择离开 disputed 时必须移除 `user_disputed` 并恢复合法 status，否则新快照会违反条目不变量或继续把旧异议当成当前事实。
- 新集成用例最初复用既有主条目，导致后续历史测试的时间线和计数改变；改用独立 owner/item/source 并在 finally 级联清理后恢复隔离。这再次说明状态型集成测试必须拥有自己的聚合生命周期。
- 公开写响应越小越稳。客户端后续应在成功后重新读取现有最小 current view，而不是把写响应扩展成第二套完整读取契约。
- contracts 根产物变化使双端总量各增加约 261 字节，WeApp 只余 265 字节；下一轮不能直接增加页面交互，必须先做可复现的结构性减量。

## 6. 全局状态、项目反思与下一步

Personal Model 现在拥有三个可逐项读取的严格主题，以及四项本人反馈的认证、精确修订、原子写入和响应丢失恢复服务端边界。它仍不是用户可见闭环：当前页面没有反馈按钮，temporary/note/reason 交互、写入中的权限、成功后重读和错误恢复尚未实现。

下一轮先取得 WeApp 结构性包体降幅，再实现无页面引用的客户端反馈传输与写入权限模型：严格解析最小收据，区分 idle/submitting/succeeded/failed，绑定当前 `itemId + revision + eventId`，拒绝迟到结果和 subject 切换后的提交。仍不接按钮，避免把包体、安全状态与复杂交互混在同一轮。

Weekly Cognitive Review、lineage/证据分页、模型导出、Pattern/Hypothesis、LLM、自动计划调整和云资源继续后置。

## 7. 参考

- [第 199 轮档案](199-personal-model-explicit-subject-selection.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0194](../architecture/decisions/0194-personal-model-exact-feedback-http.md)
