# ADR-0179：Personal Model 反馈事件与结果事务

日期：2026-08-11

状态：已采纳

## 背景

ADR-0177 已固定四选一反馈事件和 revised/no-op 转换契约，ADR-0178 的 P2a 数据库却刻意拒绝全部用户动作 revision，因为当时没有独立反馈事件权威。若只让 revision 保存一个事件 UUID，无法证明事件真实存在、属于同一用户和目标修订，也无法证明 choice 与 revision action 一致；若 no-op 不留下收据，网络重试可能制造伪修订或丢失用户校准。反馈备注、理由和 temporary 时限又是敏感用户输入，不能放进日志或随意复制到多个可变表。

本轮只建立 P2b 追加式反馈事件、结果关系和内部仓储事务。不建立证据引用或 Weekly Cognitive Review 表，不装配控制器，不修改 OpenAPI 或客户端。

## 决策

1. `personal_model_feedback_events` 保存事件 UUID、owner、item、精确目标 revision、四选一 choice、可空理由/备注、temporary 时限、发生时间，以及 `personal-model-feedback-transition-v1` 的 revised/no-op 结果收据。
2. choice 固定生成对应 revision action。temporary 必须有晚于事件的时限，其余 choice 不得携带时限；备注去除首尾空白后为 1–300 字符，理由只能来自 P1b 枚举。
3. 插入触发器要求事件命中同 owner、同 item 的精确 current 非终态 revision，且事件时刻不早于目标修订。数据库不能接受指向旧 revision 的“迟到反馈”并静默变基。
4. no-op 必须保存固定原因和结果指纹，`result_revision` 必须为空。触发器再次检查目标快照已经处于 choice 对应 feedback state；temporary 有效期必须相同，disagree 目标必须已经 disputed。no-op 不生成 revision。
5. revised 必须令 `result_revision = item_revision + 1`，且结果指纹使用新 revision 的 `derivation_fingerprint`。事件以可延迟外键指向结果 revision；结果 revision 再以 event/owner/item/previous/action/revision/fingerprint 复合外键反向指向事件。两者必须在同一事务提交或共同回滚。
6. `UNIQUE (feedback_event_id)` 和每个 owner/item/result revision 唯一约束保证一个事件最多对应一个结果 revision。P2a 的 feedback pending 约束被正式替换，但普通 `append()` 继续拒绝任何带事件的 revision，防止调用方绕过反馈事务。
7. 事件 UPDATE 和直接 DELETE 均失败关闭。由账户 owner 删除触发的级联允许清理 item、revision 与 feedback 全历史；普通删除、导出和备份处置仍待后续设计。
8. `applyFeedback(userId,itemId,transition)` 先解析完整 P1b 转换，再按认证 owner/item 锁定 item。锁取得后必须用新的 SQL 语句读取 current revision，不能用一条 JOIN 锁查询继续消费等待前快照。
9. 契约允许带明确偏移的 RFC 3339 时间，而 PostgreSQL `timestamptz` 回读统一时区表示。仓储只在幂等比较副本中把条目、证据、事件与 temporary 时限中的绝对时间折算为 UTC 时刻，不改写指纹覆盖的 revision/evidence JSON；revision 回读校验数据库 `changed_at` 与快照 `updatedAt` 是同一时刻，并保留快照表示。
10. 在 item 行锁内，如果事件 UUID 已存在，仓储从不可变目标 revision、可选结果 revision 和事件行重建完整转换。与时间语义折算后的输入完全相同则安全返回本次已验证表示；同一 UUID 的目标、choice、文字或结果不同则冲突。网络结果未知时可以重试同一事件，但不能借事件 ID 替换内容。
11. P2b 的幂等只在内部完整转换对象上成立。未来 HTTP 层仍需定义认证错误隐藏、请求期限、客户端收据和读取侧对账；不得把内部 event UUID 直接当成公开授权或永久重放令牌。

## 影响

- 用户确认、暂时情况、不同意和不确定第一次具有数据库级追加事实，而不是只有 revision 上的无法验证引用。
- revised 事件与结果 revision 不能单独提交；no-op 有明确收据且不会污染历史修订数量。
- 相同事件并发重试收敛到一条事件和最多一条 revision，事件身份换内容则显式冲突。
- 语义相同但采用 `+08:00` 或 `Z` 表示的绝对时间在比较副本中收敛为同一时刻，不会因数据库回读格式变化破坏重放，也不会改写快照或指纹。
- item 锁与 current 读取分离修复了一个此前未暴露的并发边界：等待行锁的 JOIN 查询可能保留等待前快照，导致刚发布的 current revision 在连接结果中消失。
- reason、note 与时限进入敏感持久数据范围，后续导出、更正、删除、保留与界面文案必须覆盖这些字段。
- R-033 的用户校准持久化部分得到缓解，但证据来源撤回、纵向阈值、内容正确性和真实用户理解仍未证明。

## 备选方案

### 只在 revision 保存 feedback event UUID

拒绝。UUID 不证明事件存在、所有者相同、目标精确或 choice/action 一致，也无法表达 no-op 收据。

### no-op 不写数据库

拒绝。响应丢失后无法区分“事件已接受但无需修订”和“事件从未发生”，重试可能重复产生动作或让用户校准消失。

### 相同事件 ID 一律返回冲突

拒绝。安全的精确重放可以由不可变事件、目标和结果历史重建；完全拒绝会让未知网络结果无法恢复。只有身份换内容才应冲突。

### 用一条 JOIN 查询同时锁 item 和读取 current revision

拒绝。并发等待者可能在锁等待前取得查询快照，获得锁后却看不到先行事务刚插入的结果 revision。先锁 item、再发起新读取能明确使用锁后已提交状态。

### 同轮开放反馈 API 和页面

拒绝。P2b 只证明持久事务；HTTP 授权、读取侧对账、客户端状态、无障碍和用户文案需要独立验收。

## 验证

- 静态 schema drift 必须锁定全部 choice/reason/no-op/version、目标/结果关系、pending 约束替换、不可变触发器和双向延迟外键。
- 真实 PostgreSQL 必须证明 revised 事件与结果 revision 原子提交、no-op 不产生 revision、过期/跨 owner 目标不落事件。
- 两个并发的相同事件必须都返回同一结果，数据库只保存一条事件和一条结果 revision；同一事件 ID 换内容必须冲突。
- 使用非 UTC 明确偏移提交同一事件时，首次响应和重放响应必须一致，并保留调用方已验证的事件、temporary 时限和 revision 时间表示。
- 原始 SQL 必须无法改写/删除事件、提交缺少结果 revision 的 revised 事件或伪造不成立的 no-op。
- 账户删除必须级联 item、revision 与 feedback；目标测试结束后三张表都为零行。
- strict typecheck、完整单元/集成、构建、生产依赖审计、双端客户端质量、中文文档、迁移清单、Obsidian 和 Git 差异门禁全部通过后才能提交。

## 关联

- [ADR-0177：Personal Model P1b 修订、反馈转换与每周回顾契约](0177-personal-model-revision-and-weekly-review-contract.md)
- [ADR-0178：Personal Model item/revision 最小持久内核](0178-personal-model-item-revision-persistence-core.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 185 轮档案](../../iterations/185-personal-model-feedback-event-transaction.md)
