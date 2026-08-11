# 第 181 轮：个人认知模型领域与架构基线

日期：2026-08-11

分类：A（Architecture）

状态：已完成

## 1. 范围与验收标准

本轮只完成 Personal Model 的领域与架构分析，把衡迹从记录/计划工具演进为“个人认知镜子”的目标转化为可实施、可验证的工程顺序。验收标准为：现有能力与缺口完成映射；Goal、Constraint、Preference、Baseline、Behavior、State、Pattern、Hypothesis 边界明确；条目、证据、修订、状态机、置信、用户校准和 Weekly Cognitive Review 形成权威设计；首批低歧义场景、分阶段路线图和新增产品风险同步进入受保护文档。

本轮不新增业务 Schema、数据库迁移、API、OpenAPI 路由、客户端页面或 AI Agent；也不继续 weeklyPlans 递归导出、云部署、真实模型、设备接入或其他需要用户手动配置的外部工作。

## 2. 项目结构、设计、技术与实现功能

- `docs/architecture/PERSONAL_MODEL.md`
  - 建立长期个人认知模型的权威领域文档。
  - 固定八类认知、结构化 claim、EvidenceReference、不可变 revision、生命周期与可复算置信收据。
  - 定义四选一用户校准、每周认知回顾和首批两个确定性场景。
- ADR-0175
  - 决定保留当前个人状态账本，并把长期 Personal Model 建成独立派生层。
  - 禁止自由文本画像、LLM 事实权威和一次性大 Agent 路径。
- 产品与交付文档
  - 产品简报增加“个人认知镜子”主张、用户任务、MVP 范围与新北极星。
  - 已实现 PRD 明确该能力尚未实现；路线图增加 P0–P8 主线；风险登记新增 R-033。
- 架构、数据库与 API 文档
  - 明确当前账本与长期模型职责、候选表/API 和“尚未实现”边界。
- 文档治理
  - 把 Personal Model 加入中文语言门禁和迁移索引活跃权威文档。

## 3. 实现方法

1. 复读当前产品简报、已实现 PRD、路线图、风险登记、架构、数据库、API、健康/训练/饮食/计划/AI/隐私模型和 `personal-state-ledger-v1` 契约。
2. 把建档资料、不可变记录、固定 7/30/90 洞察、恢复状态、周计划、显式训练关联、七日结果回看和本人反思映射为可复用证据源。
3. 识别现有账本缺少持久生命周期、精确修订、支持/反对证据、用户校准、周回顾和模型更新闭环。
4. 以“来源权威不变、长期派生可撤销、结构优先于文案、确定性优先于模型、反馈绑定精确修订”为设计约束。
5. 先选择“安排约束与已记录行为并列”及“已记录课次时长基线”，避免从缺失数据推断意图、偏好、依从性或因果。
6. 同步所有权威文档和治理脚本，随后运行格式、语言、迁移、链接、Obsidian 及全量质量门禁。

## 4. 验证证据

- 目标文档治理测试：2 个文件、16/16 项通过。
- 中文文档门禁通过：Personal Model 中文占比 73.4%，无纯英文叙述行；风险清单为 31 项、21 项高与 10 项中。
- 文档迁移索引通过：`docs/` 共 386 份 Markdown，11 份活跃权威文档；第 090–181 轮 92 份、ADR-0085–0175 91 份连续受保护，待迁移总量保持 191。
- 完整单元测试：101 个文件、571/571 项通过。
- 完整集成测试首次因本机 Docker 引擎未运行而拒绝连接本地 PostgreSQL/Redis；启动 Docker Desktop 并执行 `pnpm db:up` 后，23 个文件、130/130 项重跑通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- Prettier、12 份变更 Markdown 的相对链接和 `git diff --check` 通过。
- Obsidian 权威状态镜像同步并独立校验通过：71,341 bytes，SHA-256 `4378f35d01da9b902ccbf4cf60c71fe161458b160b34a041f29a085d17bf9213`。

## 5. 发现的问题与经验

- 当前个人状态账本已经证明知识类别和来源可分离，但它的安全价值正来自“不持久化、不声称完整”；长期模型不能通过直接扩展同一快照获得。
- Goal、Constraint 和 Preference 是用户自我定义，行为只能形成候选观察，不能反向改写这些本人事实。
- Pattern 描述重复关系，Hypothesis 才承载待验证解释；把两者合并会让相关性在 UI 中悄然变成原因。
- 用户反馈本身也是有时间和上下文的证据。一次“符合我”不能把候选模型永久变成真理，一次“不同意”也不能删除历史系统证据。
- 置信必须是可复算的产品收据，而不是模型自评概率；覆盖、稳定性、矛盾、时效与争议都需要显式展示。
- 最小闭环应先证明用户能理解、校准和看到修订，再扩展到 Outcome 或 Contextual Decision。
- 集成门禁依赖本地 Docker 引擎；测试失败时应先区分服务未启动与业务断言失败，并在服务健康后完整重跑，不能把 130 项 skipped 误报为通过。

## 6. 全局状态、项目反思与下一步

本轮完成 P0 领域基线，没有把设计冒充实现。项目主线已从基础设施尾部优化切换到 Evidence → Personal Model Item → Weekly Review → User Feedback → Model Revision；R-033 以高风险开放，直到纵向证据、专家审阅和真实用户标签理解研究完成。

下一轮只实现 P1 最小共享契约：`PersonalModelItem` 公共头、首批三个 claim 联合、EvidenceReference、置信收据、状态和 feedback event。验收重点是 Goal/Constraint 不被 Behavior 覆盖、Pattern/Hypothesis 不声明因果、disputed/candidate 不可进入决策输入、Unknown 不编码为零。下一轮仍不建表、不开放 API、不实现客户端。

## 7. 参考

- [第 180 轮档案](180-bounded-recovery-state-plan-evidence.md)
- [项目状态](../PROJECT_STATUS.md)
- [产品简报](../product/PRODUCT_BRIEF.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [ADR-0175](../architecture/decisions/0175-evidence-backed-revisable-personal-model.md)
