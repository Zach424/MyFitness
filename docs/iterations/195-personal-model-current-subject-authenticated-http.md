# 第 195 轮：Personal Model 当前主题认证只读 HTTP

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只开放一个当前主题认证只读路由。调用方必须使用现有 Bearer 会话和三个严格 subject 之一；响应只能是第 194 轮 owner-free 最小可见视图。无认证、非法主题、active 空主题、认证后 authority 竞态与内部数据故障必须有不同且不可枚举的语义。敏感推导响应的禁止缓存要覆盖 200、400、401、404、500 全部状态，并由 OpenAPI、控制器测试和真实 PostgreSQL HTTP 测试证明。

本轮不新增迁移、客户端、页面、持久缓存、轮询、历史 lineage、证据分页、反馈 API、Weekly Cognitive Review、Personal Model 导出、自动调度、LLM 或云资源。单一路由不能被描述为完整用户认知镜子。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/personal-model/personal-model.controller.ts`
  - 新增认证 `GET /v1/personal-model/subjects/{subjectKey}/current`。
  - 解析共享 subject 枚举，再次验证严格可见响应；只把统一 unavailable 映射成无身份线索 404。
- `apps/api/src/personal-model/personal-model-current-subject-no-store.middleware.ts`
  - 在 Session guard 之前为精确路径设置 `private, no-store`。
- `apps/api/src/personal-model/personal-model.controller.test.ts`
  - 覆盖正常、非法 subject、unavailable 与内部 conflict 四项控制器边界。
- `apps/api/src/personal-model/personal-model-http.integration.spec.ts`
  - 新增六项真实 HTTP/PostgreSQL 测试，覆盖认证、参数、空主题、404/500 故障、非空视图、no-store 和双 owner 隔离。
- `apps/api/src/openapi.test.ts`
  - 锁定新路径、Bearer security、三值路径枚举和五种响应。
- `apps/api/src/app.module.ts`
  - 注册控制器，并只对精确当前主题 GET 应用前置 no-store 中间件。
- ADR-0189、Personal Model、架构、数据库、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 路由不接受 owner ID。`@CurrentUser()` 从 Session guard 获取服务端主体，避免客户端选择或枚举其他 owner。
2. subject 先经共享 Zod 枚举 `safeParse`；非法值返回带固定消息和 subject 路径的 400，不进入 repository，也不存在默认主题或字符串 fallback。
3. 控制器调用第 194 轮应用服务，并对结果再次运行严格可见 Schema，防止服务或未来替身返回额外字段。
4. active owner 没有主题仍是 200 + `current:null`，表示读取成功但尚无条目；它不等于 Unknown claim，也不等于 transport/authority 失败。
5. Session guard 本身只允许 active user。若账号状态在认证 SQL 与 current-subject SQL 之间变化，repository authority 错误先统一为应用 unavailable，再由控制器映射成空正文 404。
6. 控制器只捕获该专用 unavailable 类型。歧义、残缺、Schema 损坏或其他错误继续抛出，由 Nest 生成不含内部原因的 500；不能为了身份隐藏而掩盖数据问题。
7. 初始仅使用方法级 `@Header` 时，定向 HTTP 测试发现 guard 早退的 401 没有 Cache-Control。修复采用精确路径前置中间件，在 guard 前设置头；方法级 Header 继续保留，最终 200/400/401/404/500 均实测禁止缓存。
8. 中间件只匹配一个 GET 路径，没有把 Personal Model 策略扩散到其他控制器；未来新增 lineage/反馈路由必须各自声明缓存与权限。
9. OpenAPI 不只检查路径存在，还检查 security、参数所在位置、required、Schema 内三值枚举和五种响应，避免文档与运行时静默漂移。
10. 真实 owner 隔离测试让第一 owner 产生 45 分钟训练时长 Baseline，第二 owner 用独立 token 读取同一 subject 仍只能得到空主题；第一响应逐项排除 user ID、revision UUID、references 与 fingerprint。

## 4. 验证证据

- 定向契约、投影、控制器与 OpenAPI：4 个文件、38 项通过。
- 定向当前主题 HTTP/PostgreSQL：1 个文件、6 项通过。
- 完整单元测试：108 个文件、649 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、174 项通过。
- 工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 浏览器客户端未改变，沿用 95 项浏览器基线；本轮不据此声称存在 Personal Model 页面。
- 数据库应用并核验 44 个迁移；本轮没有迁移。集成清理后 evidence refs、feedback events、item revisions、items、refresh requests、refresh resolutions 六张 Personal Model 表均为 0。
- 中文文档与迁移索引通过：`docs/` 共 414 份 Markdown，第 090–195 轮 106 份档案与 ADR-0085–0189 105 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像在提交前完成逐字节同步与校验，仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 格式与 Git 差异检查在提交前再次完成。

## 5. 发现的问题与经验

- 控制器级 Header 不是整条路由的缓存边界。认证 guard 早于方法执行，未认证响应需要前置中间件或全局策略才能获得 no-store。
- 空主题、Unknown、unavailable 和内部失败是四种不同状态。空主题是成功领域结果；Unknown 是一次证据不足的派生；unavailable 隐藏读取期间 authority；内部失败必须被运维观察。
- 不可枚举不等于把所有错误变成 404。非法 subject 应明确 400，缺少会话应 401，数据冲突应 500；只有 owner authority 竞态统一 404。
- 路径不接受 owner ID 是最小授权面。即使 repository 有复合 owner 约束，也不应让本人读取 API 暴露可选择的 owner 参数。
- OpenAPI 参数枚举位于 `parameter.schema.enum`，测试应验证生成器真实结构，不应凭印象把 enum 放在参数顶层。
- 真实派生器测试数据必须处于完整本地周并具备资料时区权威。固定旧日期或仅创建登录账号都会被现有派生门禁正确拒绝；测试最终使用相对当前周与精确用户资料。
- 接口可用不等于页面可靠。客户端必须先定义未读、加载、就绪、刷新、初始失败和过期快照，不能把网络失败显示成空主题。

## 6. 全局状态、项目反思与下一步

Personal Model 的首批三个严格 claim 现在拥有从确定性派生、不可变 revision/代际、当前单语句选择、最小可见投影到认证 HTTP 的完整服务端读取切片。所有者只来自会话，路径只接受明确主题，空主题、认证、参数、authority 竞态和数据故障均有独立语义，且所有响应禁止缓存。这让一个可调用入口具备最小隐私、安全和可解释字段边界。

下一轮只实现客户端当前主题读取适配器与五阶段页面内存权限：传输成功必须严格解析共享视图；初始失败不能伪装成空主题；刷新失败保留整份旧快照并标记过期；只允许显式重试，不持久化、不轮询。先不创建新页面，可在纯模型和 API 适配器层完成验证。

最小展示、反馈命令/界面、lineage/证据分页、Weekly Cognitive Review、Personal Model 便携导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。当前 API 仍是有限记录的当前摘要，不能自动驱动训练、饮食或医疗建议。

## 7. 参考

- [第 194 轮档案](194-personal-model-current-subject-visible-projection.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0189](../architecture/decisions/0189-personal-model-current-subject-authenticated-http.md)
