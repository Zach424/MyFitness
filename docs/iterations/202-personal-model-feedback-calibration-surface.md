# 第 202 轮：Personal Model 本人校准界面

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只把 `matches_me`、`disagree`、`uncertain` 三种反馈接入 Personal Model 当前主题页面。入口仅对非空、非终态 ready 快照开放；提交必须冻结精确主题、item、revision、event 和 choice；成功后必须显式重读完整当前视图。网络未知只允许本人用同 event 重试，409 必须先读取新修订，失败不能显示服务端正文或自动重放。

`temporary_context` 因为需要本人选择未来截止时间而明确后置，不发明默认期限；reason、敏感 note、历史、lineage、证据分页、Weekly Cognitive Review、模型导出、LLM、计划调整和云资源均不在本轮范围。

## 2. 项目结构、设计、技术与实现功能

- `apps/client/src/pages/personal-model/index.tsx`、`index.scss`
  - 在当前认识卡下方增加紧凑“本人校准”签署区，三种选择具有 pressed、可见焦点、提交、成功和分类失败状态。
  - 写入期间冻结主题和读取；成功后重新请求当前主题，冲突只允许先读取最新认识。
- `apps/client/src/pages/personal-model/personal-model-page.model.ts`
  - 固定三种选择及 offline/unknown/service/refused/conflict/invalid-contract 产品文案；不展示原始异常。
- `apps/client/src/lib/personal-model-feedback-event.ts`
  - 使用平台 UUID 能力生成新反馈 event，并保留不依赖持久存储的兼容回退。
- `apps/client/src/lib/personal-model-feedback-write.ts`
  - 写收据新增 choice 身份，accept 同时核对目标、event 与 choice，避免合法但属于其他选择的收据提交成功。
- `packages/contracts/src/personal-model.ts`
  - 导出既有 `PersonalModelFeedbackChoice` 类型供客户端页面使用，不改变线上的 Schema 或 HTTP。
- `apps/client/config/index.ts`
  - Terser 保留 UTF-8 中文，解除默认 ASCII 转义造成的 WeApp 包体放大；既有质量预算不变。
- `package.json`
  - 完整单元测试固定为 25% worker，避免工作站并发资源争用导致既有 CPU 密集测试偶发超时，测试范围不缩减。
- ADR-0196、Personal Model、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 页面只从严格 current view 取得当前非终态 target；新提交生成 event，并将 target、choice 与 write generation 一次冻结。提交期间 subject 按钮、刷新和反馈均不可再次触发。
2. 反馈请求继续把 reason、note、contextValidUntil 发送为 null。页面不保存反馈正文，不把选择写入路由、应用存储或定时任务。
3. `acceptPersonalModelFeedbackWrite` 在原有 item/revision/event 核对上增加 choice 双向匹配，迟到或错选择收据保持无效。
4. 成功先保存最小收据，再通过既有 current read authority 发起完整重读；只有新视图的 item、revision、feedbackState 与收据一致，才显示“当前认识已重新核对”。
5. 离线、未知和暂时服务失败允许按钮式同 event 重试；冲突不重试旧命令，只读取最新快照；拒绝和无效收据无直接重试入口。
6. 视觉上沿用页面的米白底、深墨文字和细边框，以低饱和绿色表示本人签署区域。没有进度条、评分、红绿对错或运动营销式视觉。
7. 初次接线的默认 ASCII 转义让 WeApp 达到 1,163,333 字节并超过 1,150,000 门槛。保留 UTF-8 后降至 1,079,727 字节，证明超量来自构建编码而非必需功能；预算未提高。
8. 完整测试默认并发下，两项既有 CPU 密集用例在高负载工作站超时，而隔离执行通过。固定 25% worker 后正式根命令稳定执行全部 120 个文件，未修改业务超时断言或排除测试。

## 4. 验证证据

- 定向页面模型、页面结构、事件、写权限、反馈 API 与共享契约：5 个文件、63 项通过。
- 完整单元测试：120 个文件、775 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、176 项通过。
- 全工作区 strict typecheck 通过；contracts、domain、API、管理端与生产 H5 构建通过；生产 WeApp 构建和客户端质量门禁通过。
- 客户端质量：H5 总量/入口/最大异步块 1,264,067/315,457/150,085 字节；WeApp 总量/vendor/最大页面 1,079,727/19,338/48,416 字节。对应余量为 H5 总量 1,577,933、入口 4,543、异步块 1,915，WeApp 总量 70,273、vendor 5,662、页面 14,584 字节；预算未提高。
- 本地 H5 页面用新建测试账号和已记录训练频次 R1 提交“暂不确定”，服务端生成 R2，显式重读后显示 `uncertain` 与成功文案。390 × 844 视口无横向溢出，三个反馈按钮均为 304 × 46 像素；浏览器控制台无 error/warn。测试账号已删除，临时 API 已停止，H5 已恢复默认本地 API 配置。
- production audit high 门禁通过；仍为 0 个 critical/high、9 个已登记 moderate。
- 中文、迁移索引、链接、格式、Git 差异与 Obsidian 门禁在提交前完成。

## 5. 发现的问题与经验

- 四选一契约不意味着界面必须一次开放四个选项。`temporary_context` 的未来截止时间是业务事实，不是装饰字段；缺少日期选择时明确延后比偷偷填默认值更安全。
- 写入成功和页面完成刷新是两件事。先持有最小收据、再核对完整 current view，可以清楚表达“服务已接受但页面尚未取得最新认识”的中间状态。
- 幂等 event 允许安全恢复响应丢失，但不会自动授予后台重放权限；同 event 重试仍由本人明确点击。
- 中文密集的小程序页面若被 Terser 转为 ASCII 转义，产物会产生与真实功能无关的明显放大。编码策略应通过配置和产物预算固定，不应通过删减必要中文或提高门槛处理。
- 完整 suite 的高并发会与 CPU 密集测试争用资源。降低 worker 是运行资源治理，不是降低测试覆盖；仍需保留定向、完整和集成三层证据。
- 浏览器验收还发现一个既有后端缺陷：合法新建档目标在刷新 `training.availability` 时被数据库 `enforce_personal_model_evidence_source_qualification` 以“onboarding goal evidence does not match its exact source”拒绝。系统保持失败关闭，没有写入错误认识，但本人安排主题无法生成；下一轮应先加入真实 PostgreSQL 回归并修复精确来源匹配。

## 6. 全局状态、项目反思与下一步

Personal Model 现在具备三主题逐项读取、三种可见本人反馈、精确写入权限、同 event 显式恢复、冲突重读和成功后完整视图复核。用户首次可以在页面上校准当前认识，但 temporary 截止时间、原因/备注、历史、回顾与模型导出仍未完成，不能描述为完整认知闭环。

下一轮优先修复新建档目标无法生成 `training.availability` 的精确来源资格缺陷：从真实引导资料建立合法 goal revision，在 PostgreSQL 中证明首次创建、刷新、账户隔离与失败关闭均成立。修复后再设计 temporary 截止时间选择器；lineage、证据分页、Weekly Cognitive Review、部署和云资源继续后置。

## 7. 参考

- [第 201 轮档案](201-personal-model-client-feedback-write-foundation.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0196](../architecture/decisions/0196-personal-model-feedback-calibration-surface.md)
