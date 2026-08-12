# ADR-0195：Personal Model 客户端反馈写入基础

日期：2026-08-12

状态：已接受

## 背景

第 200 轮已经提供精确修订的认证反馈 HTTP，但客户端没有安全调用边界。直接把 unknown 响应断言为共享类型，会允许扩展字段、错 item、错 revision、错 event 或错 choice 被当成成功；页面异步回调也可能在用户切换主题、重新提交或离开页面后覆盖新状态。与此同时，新增两个写入版本常量使 Personal Model 读取页经 CommonJS 常量聚合多装载 261 字节，WeApp 只余 265 字节，不能直接继续接入界面。

本轮只实现无页面引用的传输、严格运行时校验、页面内存写权限与结构性包体减量。按钮、temporary 选择器、原因/备注输入、成功后重读、历史、lineage 和回顾不在本轮范围。

## 决策

1. 将当前主题读取所需版本、主题、状态、反馈状态、置信限制和两项数值上限移入 `personal-model-current-subject.constants`；将反馈写版本、choice、reason、no-op 与备注上限移入 `personal-model-feedback.constants`。聚合模块继续重导出，现有服务端和根契约 API 不变；轻量读取/写入运行时只导入专用入口。
2. 读取与反馈轻量守卫共享无第三方依赖的偏移日期校验。除格式和 `Date.parse` 外，还逐项检查公历日期、时分秒与偏移范围，拒绝 JavaScript 自动归一化的 2 月 30 日等非法值。
3. 客户端写入传输仍复用现有认证请求，调用 `POST /personal-model/items/{itemId}/revisions/{revision}/feedback`；公开函数只返回 unknown，由独立适配器负责校验。
4. 适配器在发出请求前严格验证 UUID item、正安全整数 revision 和共享最小 request。成功响应必须满足 exact keys、响应跨字段不变量，并与请求的 `itemId + targetRevision + eventId + choice` 一致；temporary 的 `validTo` 必须与请求有效期表示同一绝对时刻。
5. 页面内存写权限明确区分 `idle/submitting/succeeded/failed`。每次提交获得单调 generation 收据，收据绑定 subject、item、revision 和 event；较新提交、主题替换与页面失效会撤销旧收据，迟到成功和失败保持无效。
6. 写失败只保留 `offline/refused/service/unknown/conflict/invalid-contract` 产品分类。后端消息、note、reason 和请求副本不进入状态；本轮不创建本地存储、后台队列、自动轮询或自动重放。
7. 本轮模块不被页面导入。包体验收必须由父提交隔离构建证明增量来源，再由当前生产 WeApp 构建证明结构性下降；预算不得提高。

## 影响

- 页面下一轮可以在不复制 HTTP、Schema 和异步权限逻辑的前提下接入反馈。
- 错配或扩展的最小收据不会被当成成功，迟到请求也不能跨主题或页面生命周期提交。
- 网络未知仍需要未来界面明确提供同 event 重试；当前基础不会替用户决定重放。
- 当前主题读取页不再装载与读取无关的 Personal Model 常量，给后续小界面留出可测余量。
- 反馈仍不可见，不能宣称用户已经完成校准闭环。

## 备选方案

### 直接使用 Zod 解析客户端响应

拒绝。Personal Model 页面已证明根 Zod 运行时会显著扩大延迟路由；轻量守卫与权威 Schema 的一致性夹具能保留严格边界。

### 只按 HTTP 2xx 接受响应

拒绝。2xx 不证明收据属于本次 item、revision、event 或 choice，也不能防止服务漂移和扩展字段进入页面状态。

### 在 API 函数内直接返回共享响应类型

拒绝。TypeScript 类型不能验证网络 unknown，且会让调用方绕过身份匹配与跨字段校验。

### 在本轮直接接入四个按钮

拒绝。包体、传输和迟到写权限需要先独立证明；temporary、原因/备注、冲突和成功后重读仍需单独设计。

## 验证

- 专用运行时、客户端适配器与写权限定向测试覆盖合法/非法契约一致性、目标/事件错配、temporary 时刻、非法公历日期、迟到提交、主题替换、失效和失败分类。
- contracts 构建与客户端 strict typecheck 通过。
- 父提交隔离构建证明第 200 轮 261 字节增量全部位于 Personal Model 页面；专用运行时常量进一步解除无关聚合装载。
- 完整测试、生产构建、客户端质量、文档和 Obsidian 证据记录在第 201 轮档案与项目状态中。

## 关联

- [ADR-0191：Personal Model 客户端当前主题读取权限](0191-personal-model-current-subject-client-read-authority.md)
- [ADR-0194：Personal Model 精确修订反馈 HTTP](0194-personal-model-exact-feedback-http.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [第 201 轮档案](../../iterations/201-personal-model-client-feedback-write-foundation.md)
