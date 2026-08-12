# 第 198 轮：Personal Model 固定主题读取页面

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只把 `training.recorded_frequency` 接入独立 Personal Model 页面。页面必须支持进入读取、可信成功/空态、手动刷新、初始失败重试、刷新失败保留旧快照和卸载失权；未知与失败不得显示为零，旧快照必须明确过期。页面从“我的衡迹”可达，并在 360 px 保持无横向溢出。

本轮不批量读取训练安排或课次时长，不开放反馈、历史、lineage、证据分页、Weekly Cognitive Review、模型导出、持久缓存、轮询、自动计划调整、LLM 或云资源。

## 2. 项目结构、设计、技术与实现功能

- `apps/client/src/pages/personal-model/`
  - 新增固定主题页面、失败文案纯模型、结构/文案测试和响应式样式。
- `apps/client/src/app.config.ts`
  - 注册 `pages/personal-model/index` 延迟页面。
- `apps/client/src/pages/index/me-hub.*`
  - “我的衡迹”由两项权限扩展为三项，新增“认知镜子”入口；桌面三列、窄屏单列。
- `packages/contracts/src/personal-model-current-subject.runtime.ts`
  - 新增无 Zod 运行时的严格当前主题视图校验器。
- `packages/contracts/src/personal-model-current-subject.runtime.test.ts`
  - 与权威 Zod Schema 做合法/非法夹具一致性核对。
- `packages/contracts/package.json`、`vitest.config.ts`
  - 暴露轻量子路径并让测试直接绑定源码实现。
- `apps/client/client-quality-budget.json`
  - 在消除意外依赖后，把 WeApp 总量门槛按新页面净成本从 1,107,000 校准为 1,150,000 字节。
- ADR-0192、Personal Model、架构、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 页面创建固定主题读取状态，挂载后发起一次请求；同一时刻 busy 时拒绝重复触发。
2. 成功和失败只通过第 196 轮代次收据提交。卸载先撤销活动标记并使代次失效，避免迟到回调修改已离开页面。
3. 初始加载不渲染零值；初始失败按 offline/refused/service/unknown 提供产品文案和单一重试入口。
4. 成功后才出现手动刷新。刷新期间保留旧卡片；刷新失败同时保留完整快照并说明仍是上次结果。
5. 页面只把严格视图传给第 197 轮纯展示模型和 props-only 卡片，不在 JSX 内重新解释 claim、证据或状态。
6. 初次 H5 构建发现根契约 Zod 让路由块增长到约 562 KiB。新增轻量严格校验器，精确复核键、格式、枚举、计数、时域、状态和三种 claim 的交叉不变量；类型仍从权威契约导入，运行时不加载 Zod。
7. 一致性测试把轻量校验结果与 Zod `safeParse` 比较，覆盖空态、三种合法 claim、额外字段、主题错配、终态错配、重复限制、计数越界、聚合不一致、时区错误、重复星期和四分位逆序。
8. 页面采用大标题、克制的资料说明与唯一证据刻度；固定边界常驻，避免单主题页面看似完整画像。360 px 下工具栏/边界改为单列，按钮占满可用宽度。
9. WeApp 新页面实际让总量从 1,105,112 增至 1,146,581 字节，净增 41,469。清除依赖泄漏后只校准总体积上限，vendor 和单页门槛不变。

## 4. 验证证据

- 轻量运行时一致性定向：1 个文件、12 项通过。
- 页面模型、页面结构、读取权限、适配器、展示模型/卡片与入口定向测试通过。
- 完整单元测试：115 个文件、698 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、174 项通过。
- 全工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high、9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,247,931/315,456/149,898 字节；WeApp 总量/vendor/最大页面为 1,146,581/19,338/56,943 字节，均通过校准后的严格预算，且禁止的 Zod 错误标记为零。
- 本地浏览器证明：加载态随后进入明确离线失败态，未知未显示成零；360 × 800 视口 `scrollWidth=clientWidth=360`，重试按钮完整可见，控制台无 error/warning。
- 没有真实认证 API，本轮没有浏览器成功快照证据；成功/空态/刷新/stale 由纯模型和结构测试覆盖，不夸大为真实端到端证明。
- 中文文档、迁移索引、格式、Git 差异和 Obsidian 校验在提交前完成。

## 5. 发现的问题与经验

- 类型导入轻量不等于运行时轻量。页面从共享根入口导入 Zod Schema 会把完整校验运行时带进延迟块，必须用构建产物而不是源码直觉判断。
- 轻量校验不能退化为鸭子类型。只有保留 exact keys、交叉计数、时域和 claim 绑定，并与权威 Schema 做一致性测试，才不会用包体换取信任边界缺口。
- 包体预算应区分意外依赖和真实产品成本。先拒绝 562 KiB 路由，再记录新页面 41,469 字节净成本，才有依据校准总量线。
- “离线”不是“没有训练数据”。初始失败页面必须保持 Unknown，只有成功响应中的 `current:null` 才能表达当前主题为空。
- 页面边界说明不是占位文案。固定写出未开放主题、历史与反馈，可以防止用户把单一频次观察理解成完整个人模型。
- 刷新保留旧快照比清空更稳定，但必须同时显示“上次成功结果”和失败原因，不能让旧数据冒充最新。

## 6. 全局状态、项目反思与下一步

Personal Model 首个主题现在拥有从确定性派生、不可变修订、当前主题投影、认证 HTTP、严格客户端读取权限、中性展示到可进入页面的完整垂直切片。它仍只证明“已记录训练频次”的本地失败闭环，不证明真实 API 成功、用户理解、三主题浏览、反馈校准或周回顾。

下一轮只扩展同一页面的显式主题选择，使三个已经实现的严格主题按一次一个 subject 读取。主题切换必须先使旧代次失效并清除旧主题快照，不能批量预取、合并成画像或增加持久缓存；继续复用同一轻量校验、读取权限和展示卡片。

反馈、lineage/证据分页、Weekly Cognitive Review、Personal Model 导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。

## 7. 参考

- [第 197 轮档案](197-personal-model-current-subject-neutral-presentation.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0192](../architecture/decisions/0192-personal-model-fixed-subject-page.md)
