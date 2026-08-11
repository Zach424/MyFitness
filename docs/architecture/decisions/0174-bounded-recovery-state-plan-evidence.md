# ADR-0174：主观恢复状态计划证据的有界文本

日期：2026-08-11

状态：已采纳

## 背景

ADR-0173 证明合法周计划的当前 payload 与单条 revision 都可能超过 64 KiB，因此后续异步归档需要递归分层。计划内容中的 `evidence` 保存完整 `subjective-recovery-state-v1`，其中 factor label、state label、note 与 limitation 原先只有最小长度，没有最大长度。虽然这些字段由确定性领域引擎生成，而非用户直接输入，但共享契约仍允许异常数据库值形成无界叶节点。

在把 evidence 视为计划递归来源的单个有界叶节点前，必须固定当前策略可生成文本的兼容上限，并证明最大合法多字节证据仍低于通用 64 KiB payload 门禁。该边界不能通过截断改变用户可见解释，也不能借机修改恢复状态的启发式阈值或策略版本。

## 决策

1. `subjective-recovery-state-v1` 的 factor label 最大 60 字符、state label 最大 80 字符、note 最大 320 字符、每条 limitation 最大 240 字符。
2. 上限由 `packages/contracts` 的共享常量定义，运行时 Zod、测试和生成后的 OpenAPI 使用同一来源；不在 API 或数据库层复制不同数字。
3. 不执行截断、摘要或自动修复。超过边界的异常值失败关闭，避免把不受信内容静默伪装成当前策略输出。
4. 保留既有字段、枚举与 `subjective-recovery-state-v1` 策略版本。当前确定性引擎的全部固定文案均低于新上限，因此合法现有输出无需迁移。
5. 以计划允许的 148 条证据引用、四个最大 factor、五条最大 limitation 和最大多字节中文文本构造合法 `planEvidence`，其 UTF-8 JSON 必须小于 64 KiB。
6. 本轮只固定 evidence 叶节点，不实现 weeklyPlans 递归来源、history/links/reflections 分页、第九协调字段或公开下载切换。

## 影响

- 计划 evidence 不再包含共享契约允许的无界内部生成标量，后续递归计划来源可以把它作为一个有界叶节点交付。
- OpenAPI 使用 `maxLength` 公开相同限制；客户端与其他调用方能在传输前理解契约。
- 异常超长存量数据将被拒绝，而不是静默截断。若未来确需更长解释，应通过显式策略/Schema 演进和兼容迁移处理。
- 恢复状态的窗口、个人基线、阈值、置信和 planning impact 语义没有变化；R-030 仍保持高风险开放。
- ADR-0173 的 weeklyPlans 递归要求和 R-013 的其余缺口不变。

项目后续主线已经切换到 Personal Model。这个决定作为旧导出主线的安全收尾，不构成继续投入极端规模归档的理由。新的认知模型仍应复用这里的证据、来源、时间、置信与失败关闭原则，但不能把当前主观恢复状态直接等同为长期 Pattern、Hypothesis 或用户确认事实。

## 备选方案

### 保持字符串无上限，由后续递归字节流处理

拒绝。递归只能限制聚合分配，无法把一个无界标量安全拆成具有明确业务语义的多段值。

### 在导出时截断

拒绝。截断会让导出内容与用户看到和计划采用时保存的证据不一致，并隐藏异常持久值。

### 提升通用 64 KiB 门禁

拒绝。更大门禁不能提供业务边界，还会增加单元素内存与保管风险。

### 立即升级恢复状态策略版本

拒绝。新上限不改变任何合法当前引擎输出或语义，升级会制造没有产品价值的兼容分支。

## 验证

- 共享契约必须分别拒绝四类字段的边界加一值，并接受精确边界值。
- 最大 148 条引用和最大多字节文本组成的 `planEvidence` 必须通过 Schema 且 UTF-8 JSON 小于 64 KiB。
- 目标 contracts/domain、完整单元/集成、strict 类型、生产构建、OpenAPI 生成、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0173：便携归档周计划形状与关联总序边界](0173-portable-export-weekly-plan-shape-boundary.md)
- [架构基线](../ARCHITECTURE.md)
- [健康记录模型](../HEALTH_RECORD_MODEL.md)
- [周计划模型](../PLAN_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 180 轮档案](../../iterations/180-bounded-recovery-state-plan-evidence.md)
