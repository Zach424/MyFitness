# 第 201 轮：Personal Model 客户端反馈写入基础

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只完成无页面引用的 Personal Model 客户端反馈传输、严格 request/receipt 校验、页面内存写入权限和可复现的结构性包体减量。写入必须绑定当前 `subjectKey + itemId + revision + eventId`，拒绝错配收据、迟到结果、主题切换与页面失效后的提交；失败不能保存服务端正文或自动重放。生产 WeApp 必须在不提高预算的前提下取得高于第 200 轮的可测余量。

本轮不接反馈按钮，不实现 temporary 选择器、reason/note 输入、成功后重读、历史、lineage、证据分页、Weekly Cognitive Review、模型导出、LLM、计划调整、迁移或云资源。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model-current-subject.constants.ts`
  - 提取当前主题轻量运行时所需版本、主题、状态、反馈状态、置信限制和数值上限。
- `packages/contracts/src/personal-model-feedback.constants.ts`
  - 独立承载写请求/响应版本、choice、reason、no-op 与备注上限；聚合根继续兼容重导出。
- `packages/contracts/src/personal-model-time.runtime.ts`
  - 新增无第三方依赖的严格公历/偏移日期守卫，读取和写入校验器共同复用。
- `packages/contracts/src/personal-model-feedback.runtime.ts`
  - 新增与权威 Zod Schema 一致性受检的最小请求/响应运行时守卫，拒绝未知字段和跨字段矛盾。
- `apps/client/src/lib/api.ts`、`personal-model-feedback-api.ts`
  - 新增认证反馈 POST 薄传输与组合写入入口；原始网络响应始终保持 unknown。
- `apps/client/src/lib/personal-model-feedback-response.ts`
  - 请求前严格复核 UUID item、正安全整数 revision 与最小正文；成功收据核对精确 item/revision/event/choice 和 temporary 绝对时刻。
- `apps/client/src/lib/personal-model-feedback-write.ts`
  - 新增 `idle/submitting/succeeded/failed` 页面内存权限模型、单调 generation 收据、主题替换/失效和六类产品失败分类。
- `packages/contracts/src/**/*feedback*test.ts`、`apps/client/src/lib/*feedback*test.ts`
  - 覆盖契约一致性、非法日期、扩展字段、身份错配、temporary 时刻、迟到结果、主题替换、失效和正文排除。
- ADR-0195、Personal Model、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 在父提交 `bbd9d3e` 的隔离 worktree 重建 contracts 与 WeApp；与第 200 轮产物逐文件比较，证明 261 字节增量全部位于 `pages/personal-model/index.js`，来源是 CommonJS 常量聚合装载两个写版本。
2. 把 current 与 feedback 的运行时常量分别拆到专用文件。`personal-model.constants` 继续重导出，既有根契约和服务端导入无需破坏性迁移；轻量运行时改为直连最小常量入口。
3. 日期守卫不只依赖正则和 `Date.parse`，还验证月日、闰年、时分秒与时区偏移范围，避免 JavaScript 把不存在的日期自动换算到下一月。
4. API 传输返回 unknown，不用 TypeScript 类型断言冒充网络验证。writer 先验证 target/request，再发送认证 POST，之后才解析响应。
5. 响应先验证 exact keys 和共享跨字段不变量，再核对本次 item、target revision、event 和 choice；temporary 有效期以时间戳比较，允许等价偏移表示。
6. 每次开始写入都递增 generation 并冻结精确 target/event。只有当前 submitting 状态的同一收据可以落入 succeeded 或 failed；任何后续提交、subject 替换或页面失效都会取消旧权限。
7. 失败状态仅保留分类，不复制异常消息。409 单独映射 conflict，Schema/target/receipt 问题映射 invalid-contract，其余复用既有读失败族；本轮不持久化请求或实现后台重放。
8. 新模块不被页面引用，所以用户界面与现有行为不变；包体变化只来自 current 读取链路的结构性常量减量与更严格日期守卫。

## 4. 验证证据

- 定向运行时/适配器/写权限：6 个文件、73 项通过。
- 完整单元测试：120 个文件、763 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、176 项通过。
- 全工作区 strict typecheck 通过；API、管理端、contracts、domain 和生产 H5 构建通过；生产 WeApp 单独构建通过。
- 客户端质量：H5 总量/入口/最大异步块 1,248,100/315,456/149,898 字节；WeApp 总量/vendor/最大页面 1,147,123/19,338/56,943 字节。相较第 200 轮，H5/WeApp 总量分别减少 2,767/2,612 字节；WeApp 预算未提高，余 2,877 字节。
- production audit high 门禁通过；仍为 0 个 critical/high、9 个已登记 moderate。
- 父提交隔离产物为 1,149,474 字节，第 200 轮当前产物为 1,149,735 字节，逐文件差异只有 Personal Model 页面 +261 字节。
- 中文、迁移索引、链接、格式、Git 差异与 Obsidian 门禁在提交前完成。

## 5. 发现的问题与经验

- TypeScript 的 `import type` 不保证它依赖的运行时校验器只加载所用常量。CommonJS 模块的属性读取仍会执行整个常量文件；共享契约需要为客户端热路径提供显式的最小导出入口。
- “恢复旧包体”不等于结构性余量。第一次仅移走两个写版本后回到第 199 轮 526 字节余量；继续拆出 current 专用常量，才使读取页不再装载无关枚举并获得可用于下一轮的小幅空间。
- `Date.parse` 会把部分不存在的公历日期自动归一化，正则只能证明形状，不能证明日期存在。轻量 Schema 替代实现必须用与权威验证器一致的非法夹具覆盖运行时习惯差异。
- 写响应的 Schema 合法不等于它属于本次操作。客户端还必须核对路径目标、幂等事件、选择和 temporary 时刻，否则另一次合法收据可能错误完成当前提交。
- 失败分类是隐私边界。把原始 Error 存进 React 状态会让后端消息、敏感备注或网络细节进入调试工具和后续展示；只保存有界产品分类更稳。
- 响应未知重试与自动重放不同。服务端支持同 event 恢复首次收据，但未来界面仍应由用户明确触发同 event 重试，不能在后台替用户重复敏感反馈。

## 6. 全局状态、项目反思与下一步

Personal Model 现在具备三主题逐项读取、严格反馈 HTTP、客户端最小 request/receipt 适配器和可撤销写权限模型；服务端与客户端之间的反馈安全边界已经连通到页面下方一层。但用户仍看不到反馈入口，成功后也尚未重读当前完整视图，因此不能声称闭环完成。

下一轮接入最小四选一反馈界面，只对当前非空、非终态快照开放；提交中冻结主题与目标，成功后显式重读。409、网络未知、拒绝和无效响应需要独立产品文案，最小写收据不能直接替代完整 current view。temporary 有效期、reason 与敏感 note 可分阶段开放，避免在首轮页面同时引入过多复杂状态。

Weekly Cognitive Review、lineage/证据分页、模型导出、Pattern/Hypothesis、LLM、自动计划调整和云资源继续后置。

## 7. 参考

- [第 200 轮档案](200-personal-model-exact-feedback-http.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0195](../architecture/decisions/0195-personal-model-client-feedback-write-foundation.md)
