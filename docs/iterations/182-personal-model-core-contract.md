# 第 182 轮：Personal Model P1a 核心共享契约

日期：2026-08-11

分类：C（Contract）

状态：已完成

## 1. 范围与验收标准

本轮只实现 Personal Model P1a 内部共享契约：公共 item 头、首批三个 claim 联合、EvidenceReference/EvidenceSet、可复算置信收据、状态与 active-only 决策资格、显式 Unknown 和精确 revision 用户反馈事件。验收必须证明 Constraint 不被 Behavior/Goal 替换，当前联合不能表达 Pattern/Hypothesis 或因果额外字段，证据/置信/统计关系一致，candidate/disputed 不能成为决策输入，Unknown 不编码为零。

本轮不实现不可变 `PersonalModelItemRevision`、反馈状态转换结果、Weekly Cognitive Review 信封、数据库迁移、repository、API、OpenAPI、客户端或 AI 推导。它们分别保留为 P1b、P2 及后续阶段。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model.constants.ts`
  - 固定领域、状态、来源、置信、证据、claim、反馈和 Unknown 枚举及首批数量/文本上限。
- `packages/contracts/src/personal-model.ts`
  - 三个 claim 通过 discriminated union 绑定 kind、subject 和 source。
  - EvidenceSet 复核 owner、窗口、引用唯一性、支持/反对/撤回计数和指纹格式。
  - 置信收据区分本人确认与纵向观察，且与 claim/EvidenceSet 交叉核对。
  - 独立 Unknown 收据不携带伪造零统计；decision Schema 只接受 active。
  - feedback event 绑定精确 item revision，并拒绝客户端置信提权字段。
- `packages/contracts/src/personal-model.test.ts`
  - 13 项目标测试覆盖三分支、统计关系、证据、置信、门槛、状态、Unknown 与反馈安全边界。
- `packages/contracts/src/index.ts`
  - 从共享包根公开 Personal Model P1a 契约。
- ADR-0176 与 Personal Model、架构、已实现 PRD、数据库/API 边界、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 从建档 goal revision 与 workout revision 两类现有权威开始，不预先开放八类所有来源。
2. 用三个字面量联合同时绑定认知类型、主题、来源和 claim，而不是在 refine 中接受任意组合。
3. 对逐周频率重新计算总数、非零周数、最小/最大和中位数；Baseline 固定历时/四分位策略版本并复核数值顺序。
4. EvidenceReference 保存 owner、聚合修订、时间、来源、角色和撤回资格；EvidenceSet 根据完整引用重新计算全部计数。
5. 置信分支不接收模型概率，与合格证据、周数和反对计数交叉核对；不同意只产生反馈/限制，不增加置信。
6. 用独立 Unknown receipt 表达无证据、覆盖不足、冲突或过期，拒绝全零 Behavior/Baseline item。
7. 先运行目标测试与 contracts 类型，再更新权威文档，最后运行完整仓库门禁。

## 4. 验证证据

- Personal Model 目标测试：1 个文件、13/13 项通过。
- contracts 目录目标回归：19 个文件、100/100 项通过；contracts strict typecheck 通过。
- 完整单元测试：102 个文件、584/584 项通过。
- 完整集成测试：23 个文件、130/130 项通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 客户端质量门禁通过：H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均在既有预算内且无禁用标记。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引通过：`docs/` 共 388 份 Markdown，11 份活跃权威文档；第 090–182 轮 93 份、ADR-0085–0176 92 份连续受保护，待迁移总量保持 191。
- Prettier、10 份变更 Markdown 的相对链接和 `git diff --check` 通过。
- Obsidian 权威状态镜像同步并独立校验通过：71,316 bytes，SHA-256 `a8cdf168ef7abf92f646305e146c0a70354bccb4ce87234f2b686280799b78ff`。

## 5. 发现的问题与经验

- 只定义枚举不足以保护领域权限；必须让 claim discriminant 同时决定 kind、subject 和 source，才能在类型与运行时阻止行为覆盖本人约束。
- EvidenceSet 自报计数如果不从引用复核，支持、反对和撤回会形成第二套不可追溯事实。
- Unknown 与零是不同语义。独立 Unknown 收据也让后续 UI 能明确说明“没有足够证据”，而不是显示虚假的 0 次行为。
- 用户不同意不等于系统观察被删除，但 disputed 必须立即失去决策资格，并在置信限制中可见。
- P1a 的完整证据数组上限是领域安全边界，不是 API 分页设计或生产规模证明。
- 四分位算法需要在开始派生前具名版本；否则相同样本可能因库默认值不同产生无意义 revision。
- 现有 `pnpm --filter @myfitness/contracts test` 从包目录启动时与根 Vitest 的 `packages/**/*.test.ts` include 不匹配，会报告未发现测试；本轮用仓库根 `pnpm exec vitest run packages/contracts/src` 完成 100 项精确回归。该既有工具问题不影响正式根 `pnpm test`，不在功能轮混入修复。
- 本轮保留英文类型名和字段名，是为了让档案能够逐项对应代码，不表示产品界面会直接展示这些技术字面量。面向用户的表达仍须使用“本人确认的安排”“已记录行为”“证据不足”“用户不同意”等清晰中文，并把来源、时间和限制放在同一可阅读表面。
- 契约通过只能说明不合法对象无法进入后续层，不能说明用户会正确理解“记录频率”和“实际行为”的差异。真正开放前仍要用目标用户测试遗漏记录、临时变化、不同意见和证据撤回等情形，避免工程术语制造新的权威感。

## 6. 全局状态、项目反思与下一步

P1a 完成后，衡迹拥有第一组可执行的 Personal Model 结构边界，但仍没有任何用户可见个人认知模型。R-033 继续保持高风险：契约只能拒绝不合法对象，不能证明阈值、记录覆盖、长期标签或用户理解正确。

下一轮只实现 P1b：不可变 `PersonalModelItemRevision` 完整快照与 action、反馈后的状态转换/no-op 结果、Weekly Cognitive Review 当前/历史信封、精确 item revision 引用和每类卡片数量门禁。仍不建表、不开放 API；P1b 通过后再进入 P2 PostgreSQL 所有者隔离与不可变历史。

## 7. 参考

- [第 181 轮档案](181-personal-model-domain-architecture.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0176](../architecture/decisions/0176-personal-model-core-contract.md)
