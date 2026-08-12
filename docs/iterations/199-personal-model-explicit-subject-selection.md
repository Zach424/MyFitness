# 第 199 轮：Personal Model 显式主题单选

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只在现有 Personal Model 页面开放三个严格主题的显式单选。默认保持“记录频次”；选择本人安排或记录时长时，必须先撤销旧主题权限并清空旧快照，再只读取新主题。每个主题必须显示来源与非评价边界；同主题点击不得产生隐式刷新。

本轮不批量读取、不并排展示、不按主题缓存，不开放反馈、历史、lineage、证据正文、Weekly Cognitive Review、模型导出、持久化、轮询、LLM、自动计划调整或云资源。客户端预算不得提高。

## 2. 项目结构、设计、技术与实现功能

- `apps/client/src/pages/personal-model/personal-model-page.model.ts`
  - 新增三个严格主题的索引、默认选择、加载标题和当前来源/边界文案。
- `apps/client/src/pages/personal-model/index.tsx`
  - 新增具名 group 与三项 pressed 按钮；读取 subject 绑定 begin 收据，主题切换取消旧焦点并复用 replace 权限。
- `apps/client/src/pages/personal-model/index.scss`
  - 新增紧凑认知索引条、当前来源说明、选中态和窄屏真实触达尺寸。
- `apps/client/src/pages/personal-model/*.test.ts`
  - 覆盖三个主题、来源边界、单项读取、replace/cancel 权限和禁用范围。
- `apps/client/src/pages/index/me-hub.model.*`
  - “认知镜子”入口更新为本人安排、已记录观察和证据限制，不再声称只开放频次。
- ADR-0193、Personal Model、架构、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 主题模型只使用共享 `PersonalModelSubjectKey`，顺序固定为本人安排、记录频次、记录时长，默认频次保持兼容。
2. 每个按钮复用共享 pointer/Enter/Space 激活契约，并输出 `aria-pressed`；外层 group 具名为“选择要核对的个人认知”。
3. 三项不同时承载长说明。当前选择下方只显示一条来源/边界，避免重复卡片和信息噪声；按钮名称保持短且可识别。
4. `readCurrentSubject` 从 begin 收据读取 subject，确保请求身份与后续成功/失败提交使用同一权限凭据。
5. `selectSubject` 对同主题 no-op；新主题先取消延迟失败焦点，再用 replace 提高 generation、清空 started/busy/snapshot/failure，随后发起新读取。
6. 失败焦点的 `canFocus` 同时核对页面活动、subject、generation 和 failure；切换、重试或卸载都会取消旧请求，避免焦点回抢。
7. 不维护主题快照 Map。切换后页面明确回到加载/Unknown，避免上一主题内容暂留或三个敏感快照常驻内存。
8. 视觉自审先尝试三张主题说明卡，但 WeApp 超预算 745 字节且信息重复；最终改为紧凑索引条和单条当前说明，保留语义并不提高预算。
9. 360 px 浏览器发现 44 px 源码经 Taro 根字号缩放后只有约 41.95 px，因此窄屏源码目标改为 48 px，实测恢复到约 44.3 px。

## 4. 验证证据

- 页面模型、结构、入口与读取权限定向：4 个文件、23 项通过。
- 完整单元测试：115 个文件、699 项通过。
- 完整 PostgreSQL 集成基线：29 个文件、174 项；本轮未改 API、领域服务、迁移或数据库。
- 全工作区 typecheck 通过；生产 H5 与 WeApp 构建通过。API/admin 沿用第 198 轮完整构建基线。
- H5 总量/入口/最大异步块为 1,250,606/315,456/149,898 字节；WeApp 总量/vendor/最大页面为 1,149,474/19,338/56,943 字节，原预算不变且禁止标记为零。
- 本地浏览器默认“记录频次”唯一 pressed；点击“本人安排”后 pressed 与来源说明同步切换，旧失败焦点未回抢，控制台无 error/warning。
- 360 × 800 视口 `scrollWidth=clientWidth=360`；三项宽度约 100 px，高度约 44.3 px。
- 没有真实认证 API，因此三个主题成功/空态仍由共享严格契约、读取权限和展示测试证明，不夸大为真实端到端成功。
- 中文文档、迁移索引、格式、Git 差异和 Obsidian 校验在提交前完成。

## 5. 发现的问题与经验

- 主题选择是一项敏感读取命令，不只是视觉 Tab。请求必须绑定 begin 收据，切换还要撤销失败焦点，而不是只改 React 文案。
- 对主题分别缓存会让体验更快，却扩大敏感数据常驻和新鲜度问题；当前“切换即清空并重读”更容易让用户理解系统正在核对哪一项。
- 三张完整说明卡在此处反而稀释主任务。索引只负责选择，当前说明只负责来源/边界，职责拆开后更紧凑也更清晰。
- CSS 声明的 44 px 不等于浏览器真实 44 px。Taro 根字号缩放必须用真实 `getBoundingClientRect` 复核触达尺寸。
- 极窄预算会暴露重复信息和装饰。先保持来源、边界、pressed、焦点和触达尺寸，再删除阴影、边框与重复说明，是合理的减法顺序。
- 只展示一个当前快照也能让三个主题可达；“功能更多”不等于“同时处理更多敏感数据”。

## 6. 全局状态、项目反思与下一步

Personal Model 的三个首批严格主题现在均可通过同一页面逐项读取：本人安排保留本人事实权威，频次和时长保持已记录观察边界。页面还没有真实认证成功证据、反馈闭环、精确证据正文或代际历史，所以仍不能称为完整认知镜子。

下一轮只实现当前主题的本人反馈 HTTP：四个已有选择绑定精确 `itemId + revision`，由服务端反馈事务返回 revised/no-op；过期、终态、owner 竞态和响应丢失必须失败关闭。先不接客户端按钮，先形成认证 API、OpenAPI 和 PostgreSQL 权限证据。

Weekly Cognitive Review、lineage/证据分页、模型导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。

## 7. 参考

- [第 198 轮档案](198-personal-model-fixed-subject-page.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0193](../architecture/decisions/0193-personal-model-explicit-subject-selection.md)
