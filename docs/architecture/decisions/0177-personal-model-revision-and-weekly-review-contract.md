# ADR-0177：Personal Model P1b 修订、反馈转换与每周回顾契约

日期：2026-08-11

状态：已采纳

## 背景

ADR-0176 的 P1a 契约可以表达首批 Personal Model item、证据、置信、Unknown 和用户反馈事件，但尚不能证明一次反馈如何形成不可变历史，也不能让 Weekly Cognitive Review 引用当时精确的模型修订。若数据库直接保存可变 item 或回顾自由文本，用户异议、过期反馈、模型历史和回顾事实都可能被静默改写。

本轮只完成 P1b 共享契约，不建立数据库、repository、API、OpenAPI、派生器或客户端。目标是先让后续各层共享同一组完整快照、精确前驱、反馈 revised/no-op 和结构化周回顾不变量。

## 决策

1. `PersonalModelItemRevision` 保存完整 `PersonalModelItem` 快照、owner、item、正 revision、精确前驱、动作、推导指纹、可选 feedback event 和变化时刻。创建动作只能是 revision 1 且没有前驱；其他动作必须引用 `revision - 1`。
2. revision 信封和完整快照的 owner、item、revision、`updatedAt/changedAt` 必须一致。用户动作必须引用 feedback event，非用户动作不得伪造 event；动作还必须与 feedback state、disputed 或 terminal 状态一致。
3. `PersonalModelFeedbackApplication` 只接受事件与当前 item 的精确 `userId + itemId + itemRevision`，拒绝 terminal 条目和早于目标修订的事件。
4. 反馈转换结果是严格 `revised | no_op` 联合。revised 必须生成精确下一 revision、引用同一事件并使用四选一对应动作；revision 变化时间不得早于事件。no-op 不产生伪修订，只在当前 feedback state 已与选择完全一致时成立。
5. `temporary_context` 的 event 必须给出晚于事件的 `contextValidUntil`。无论 revised 或 no-op，item 的 `validTo` 都必须与事件完全一致，避免不同有效期被错误折叠为相同反馈。
6. 用户可以不同意低覆盖、低置信的观察，因此 `disputed` 不再机械要求达到 active 统计门槛；它仍要求 `disagreed + user_disputed`，且 `personalModelDecisionInputSchema` 继续只接受 active。保存异议不等于提高置信或赋予决策资格。
7. Weekly Cognitive Review revision 使用一个周一开始、七个本地日的边界及固定 `observedThrough`。所有条目卡片引用 owner、`itemId + itemRevision`、kind/status、subject、`derivedAt` 和 evidence fingerprint；拒绝跨 owner、未来和重复引用。
8. 回顾内容只有六个严格字段：最近变化最多 3、基线偏离最多 2、新 Pattern 最多 1、模型修订最多 3、Unknown 最多 2、可选验证问题最多 1。整个回顾至少有一张卡；严格对象不接受自由叙事事实。
9. recent change、Baseline、Pattern 和验证问题各自限制可引用的 kind/status；Unknown 继续使用独立收据。P1b 不允许 LLM 添加未选中的事实、数字、因果或医疗判断。
10. current envelope 可以明确返回 `review: null`，但空/非空都必须携带 owner、周、时区和证据截至时刻；非空 revision 必须与这些共同身份完全一致。history 页必须有 1–50 条同 owner、同 review、同本地周的 revision，按最新优先且 revision 唯一。分页游标仅规定有界格式，真实游标和授权属于 API 阶段。
11. P1b 的 `derivationFingerprint`、watermark 和 review fingerprint 只规定 SHA-256 格式与引用位置，不在 contracts 内定义规范序列化或生成命令。确定性 no-op 计算必须在后续领域服务中另行实现和验证。

## 影响

- 后续 PostgreSQL 可以保存完整不可变快照，而不是通过当前 item 和变更补丁猜测历史。
- 过期、terminal、时间倒置和有效期漂移的反馈在进入 repository 前即可失败关闭。
- 用户异议不会因证据不足而丢失，也不会反过来成为计划或 Contextual Decision 输入。
- Weekly Cognitive Review 只能汇总已选择且可追溯的机器条目，不能把模型自由文案当成新的长期事实。
- 当前 history 信封按单个 `reviewId` 返回同一周的修订；未来若产品需要跨周列表，必须设计独立摘要分页，不得复用并弱化本契约。
- P1b 仍没有所有者数据库隔离、不可变触发器、事务、幂等生成、来源撤回传播、导出/删除、API 授权或客户端理解证明，R-033 保持高风险开放。

## 备选方案

### 只保存字段补丁

拒绝。历史读取必须按顺序重放补丁，删除字段、策略升级和长期归档更容易产生不可恢复漂移；完整快照更适合安全审计与便携导出。

### 用户不同意时要求先达到 active 门槛

拒绝。用户可以对低覆盖候选观察提出异议；拒绝保存会把系统证据门槛错误地变成用户发言资格。异议可以保存，但继续失败关闭决策资格。

### 相同 feedback state 总是 no-op

拒绝。temporary 的有效期改变具有材料性；只有状态与有效期都相同才是 no-op。

### 让回顾保存生成后的自由文本

拒绝。第一阶段尚没有逐句来源绑定或安全 validator；严格结构化卡片能阻止新事实、因果、诊断和人格标签混入历史认知。

### 同轮建立表、API 和页面

拒绝。跨层范围过大，无法分别证明对象不变量、数据库隔离、授权和用户理解。P1b 完成后按 P2 持久化、P3 派生、P4/P5 读取与反馈依序推进。

## 验证

- 目标测试必须证明 revision 完整身份和精确前驱、动作/状态映射、过期或 terminal 反馈失败关闭、revised 精确下一 revision 和合法 no-op。
- temporary 状态必须验证事件、revision/no-op 有效期一致；低置信 disputed 可以保存但不能进入决策输入。
- Weekly Cognitive Review 必须拒绝数量超限、空回顾、角色错配、非周一或非七日边界、跨 owner、未来、重复引用和自由叙事字段。
- current/history 信封必须验证生成时间、owner、review、本地周、最新优先和 revision 唯一。
- contracts 目标/目录测试与类型、完整单元/集成、strict typecheck、构建、审计、文档和 Obsidian 门禁全部通过后才能提交。

## 关联

- [ADR-0175：有证据、可校准、可修订的个人认知模型](0175-evidence-backed-revisable-personal-model.md)
- [ADR-0176：Personal Model P1a 核心共享契约](0176-personal-model-core-contract.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [已实现产品需求文档](../../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 183 轮档案](../../iterations/183-personal-model-revision-and-weekly-review-contract.md)
