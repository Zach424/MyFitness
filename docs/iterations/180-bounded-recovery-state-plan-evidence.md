# 第 180 轮：主观恢复状态计划证据的有界文本

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只审计周计划 `evidence` 内 `subjective-recovery-state-v1` 的系统生成字符串，固定与现有确定性引擎兼容的共享上限，并证明最大合法多字节计划证据低于 64 KiB。验收标准为：四类字符串边界加一均被拒绝；现有策略字段和版本不变；不截断；最大 148 条证据引用的完整计划证据通过 Schema 且低于门禁；OpenAPI 公开相同限制。

本轮不实现 weeklyPlans 递归来源、history/links/reflections 分页、第九协调字段、公开同步下载、KMS、执行器、云服务或客户端改版。新的产品目标已把后续主线切换为 Personal Model，本轮只作为已开始的旧导出主线安全收尾。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/recovery-state.constants.ts`
  - 新增 factor label、state label、note 与单条 limitation 的 60/80/320/240 字符上限。
- `packages/contracts/src/recovery-state.ts`
  - 让 `subjectiveRecoveryStateSchema` 直接引用共享常量；异常超长值失败关闭，不截断或修复。
- `packages/contracts/src/recovery-state.test.ts`
  - 覆盖四类边界加一拒绝。
  - 构造 148 条 evidence refs、四个最大 factor、五条最大 limitation 和最大多字节中文正文，证明完整 `planEvidence` 小于 64 KiB。
- `docs/api/openapi.json`
  - 由现有生成命令重建，公开四类 `maxLength`。
- ADR-0174 与项目状态、架构、健康记录模型、周计划模型、路线图和风险登记同步更新。

## 3. 实现方法

1. 复读第 179 轮、ADR-0173、恢复状态共享 Schema、领域引擎固定文案和计划 evidence 数量边界。
2. 确认四类文本全部由当前确定性领域规则生成，不是用户自由输入；选取高于全部既有输出的兼容上限。
3. 把数字定义在 contracts 常量层，由 Zod 与测试共享，避免 API、客户端或导出层复制限制。
4. 坚持失败关闭，不加入截断。这样异常存量数据不会被静默改写，合法 v1 输出不需要迁移或策略升版。
5. 使用多字节中文填满全部文本边界，并用 `TextEncoder` 计算规范 JSON 的 UTF-8 字节，覆盖最坏字符编码而不是只数 JavaScript 字符。
6. 重新生成 OpenAPI，先运行目标 contracts/domain，再运行完整单元、集成、strict 类型、构建和生产依赖审计。

## 4. 验证证据

- 目标 contracts：1 个文件、6/6 项通过。
- 目标 domain recovery-state：1 个文件、7/7 项通过。
- 完整单元测试：101 个文件、571/571 项通过。
- 完整集成测试：23 个文件、130/130 项串行通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- OpenAPI 生成通过，四类文本分别公开 `maxLength: 60/80/320/240`。
- 最大合法 `planEvidence` 包含 148 条引用、四个最大 factor、五条最大 limitation 与多字节中文上限，Schema 解析通过且 UTF-8 JSON 小于 64 KiB。
- 中文文档与迁移索引门禁通过；`docs/` 共 383 份 Markdown，第 090–180 轮 91 份、ADR-0085–0174 90 份连续受保护，待迁移总量保持 191。
- Obsidian 权威状态镜像同步并校验通过：69,820 bytes，SHA-256 `405f0c63cac442138d04d5016ed0a407c7be3945a1a930a6298bc42eb9e1ad31`。

## 5. 发现的问题与经验

- 数组数量有界不代表对象有界；内部生成字符串同样需要显式最大长度，才能把 evidence 视为安全叶节点。
- JavaScript 字符数不是 UTF-8 字节数。边界证明必须使用多字节内容和真实编码计量。
- 对确定性生成文案设置宽松兼容上限，不等于校准恢复模型。窗口、阈值、个人基线和置信风险仍须独立验证。
- 在导出时截断会破坏采用时证据与用户导出的一致性；失败关闭能暴露异常数据，并为未来显式 Schema 迁移保留空间。
- 当前 v1 文案完全落在边界内，因此保持策略版本比制造没有语义变化的新版本更诚实。
- 新目标要求停止非必要基础设施投入。本轮完成后，周计划递归归档不再是默认下一步。

## 6. 全局状态、项目反思与下一步

本轮移除了计划 evidence 的最后一类无界内部生成标量，但没有宣称 weeklyPlans 已迁移。第 179 轮确认的 current/revision/history/link 聚合风险仍然存在，R-013 与 R-030 等级均不变。

Inspect → Rank → Improve → Validate 的下一步改为先完成 Personal Model 架构和领域分析：系统性复读现有 PRD、产品简报、风险、路线图、架构、数据库、contracts 与 API，区分 Goal、Constraint、Preference、Baseline、Behavior、State、Pattern、Hypothesis，固定 evidence references、时间有效性、confidence、source、status、revision、用户确认/否认/修正和 superseded/invalidated 生命周期。随后只实现 Evidence → Personal Model Item → Weekly Review → User Feedback → Model Revision 的最小闭环，不创建大而全 AI Agent，也不让 LLM 成为事实来源。

## 7. 参考

- [第 179 轮档案](179-portable-export-weekly-plan-shape-boundary.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [健康记录模型](../architecture/HEALTH_RECORD_MODEL.md)
- [周计划模型](../architecture/PLAN_MODEL.md)
- [ADR-0174](../architecture/decisions/0174-bounded-recovery-state-plan-evidence.md)
