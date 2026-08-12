# ADR-0185：Personal Model 同主题条目代际生命周期

日期：2026-08-12

状态：已采纳

## 背景

Personal Model 状态机把 `invalidated` 与 `superseded` 定义为不可复活终态，数据库原有 `(user_id,subject_key)` 唯一约束又永久限制一个主题只有一个 item。第 190 轮已经证明最后训练证据删除会诚实失效 recorded-frequency Behavior；但用户以后重新记录训练时，系统只能对旧终态 no-op，无法保留旧历史并形成一条新的当前认识。

简单恢复旧 item 会篡改终态含义和用户校准；删除旧 item 会丢失证据、反馈和解释历史；只移除唯一约束又会允许多个并列当前条目。代际还会与来源 refresh request、feedback、并发派生和账户删除交互，因此必须先建立数据库级唯一当前代、不可分叉 lineage 和原子后继，再扩展第三个派生场景。

## 决策

1. `personal_model_items` 增加正整数 `generation`、可空 `predecessor_item_id` 与可空 `retired_at`。现有行迁移为 generation 1、无前代、未退役，不改写任何 revision JSON。
2. generation 1 必须没有前代；generation>1 必须有同 owner/subject 的直接前代。`(user_id,subject_key,generation)` 保证代次唯一，`(user_id,predecessor_item_id)` 保证每个前代最多一个后继，复合外键阻止跨 owner 或跨 subject 连接。
3. 部分唯一索引 `(user_id,subject_key) WHERE retired_at IS NULL` 保证每个主题恰好至多一个当前代。repository 的主题选择只读取未退役 item；明确 item ID 的 current/history 仍可读取旧代。
4. 新代必须从 revision 1 开始，createdAt、updatedAt 与前代 retiredAt 使用同一时刻，且自身保持未退役。generation 必须恰好为前代+1，不能跳号、回退或从非直接前代分叉。
5. 前代只有当前 revision 状态为 `invalidated` 或 `superseded`、所有来源 refresh request 都已有 resolution、退役时刻严格晚于最后 updatedAt 时才可退役。退役与 generation+1 item/revision/evidence 创建必须在一个事务内完成；延迟门禁拒绝没有原子后继的单独退役。
6. 退役代完全只读。其 item 身份、current pointer、updatedAt 与 retiredAt 不得再变；不能接受 feedback，也不能追加新的 current revision。历史 revision/evidence/feedback/request/resolution 保持不可变并可审计。
7. 来源触发器只为 `retired_at IS NULL` 的当前代生成 refresh request。新 request 在提交时必须仍指向未退役 current revision；退役事务在提交时也必须仍无 unresolved request。双向延迟门禁关闭来源修订与代际切换的交错竞态。
8. 两个确定性派生器继续先锁 active owner，随后读取未退役当前代。终态存在 pending request 时只追加同终态撤回 revision 并解决待办，不在同一次调用创建后继。
9. 待办清空后，只有发现前代从未引用过的新精确来源才启动后继。training availability 使用前代引用中不存在的新 goal revision；recorded training frequency 使用当前窗口内前代引用中不存在的新 workout aggregate/revision。相同旧来源不能反复生成新代。
10. 后继使用新 item/revision/reference 身份，纯派生器以 `currentRevision=null` 构造 revision 1，不继承前代 feedback。旧终态不复活，新代按当前证据重新得到 candidate/active 和 unreviewed。
11. owner 锁是同账户代际切换的串行点。两个并发执行者中只有一个能退役前代并创建后继；等待者锁后重读新当前代并返回 no-op。数据库唯一索引和触发器仍保护未来旁路。
12. 账户删除继续从 users 根节点级联整个 predecessor 链及全部 revision/evidence/feedback/request/resolution。普通业务路径不物理删除任何代。
13. 本轮不修改共享 item revision Schema，也不开放按主题 current、lineage 列表、分页、公开 API、便携导出或客户端展示。generation 是内部聚合元数据，公开解释另行设计。

## 影响

- 终态仍然不可复活，同时新证据可以形成全新、可追溯且唯一的当前认识。
- 旧代与新代使用不同 item 身份和独立 revision 计数，用户反馈不会被无意继承到新陈述。
- 数据库可以证明 lineage 连续、不分叉、只有一个当前代和退役/后继原子性，不再依赖应用约定。
- 来源义务不会落到退役代或在切换后悬空；并发冲突显式失败并要求重读。
- 旧 item current/history 按 ID 继续兼容，但没有公开主题/代际查询，因此仍不是用户可见功能。
- 增加三个递增迁移而不是回改已应用迁移：0042 建立代际，0043 关闭来源竞态，0044 收紧新代和退役时间。迁移校验和保持不可变。

代际只表示系统对同一主题的一段认识生命周期，不表示用户本人发生了“版本升级”，也不能被用作成熟度、能力或人格阶段标签。旧代终止可能来自来源删除、策略变化、证据不足或用户纠正；新代出现只说明当前又有一组能够独立形成陈述的证据。未来界面应使用“以前的记录结论”“当前记录结论”等可理解说明，并同时展示时间、依据和失效原因，不直接暴露内部代次编号来暗示价值排序。

新代也不是对旧代错误的自动判决。旧 revision 保存的是当时证据和规则下发布的陈述，新代保存的是后来证据形成的新陈述；两者可以不同，也可以数值相同。系统不得为了让趋势显得连续而合并两代统计、复制旧反馈或隐去中间 Unknown。只有用户明确查看历史时，才按时间顺序解释前代为何结束、后继为何开始。

运行层遇到代际冲突时必须整体重试读取，不能靠补写数据库记录“修好”。如果来源更新与退役同时发生，失败事务没有发布任何半成品；调用方重新取得账户锁后，会看到旧代待办、新代已经存在或仍可创建三种明确状态之一。监控只能记录无敏感内容的冲突分类和次数，不得记录 claim、证据正文、用户反馈或精确训练时间。

## 备选方案

### 终态直接恢复 active

拒绝。它会抹掉终态形成原因，把新证据混入旧 item 的用户反馈和有效期，破坏共享状态机。

### 删除旧 item 后重建

拒绝。普通删除会丢失来源撤回、用户校准和解释历史，也违反内部只追加与账户级擦除边界。

### 只移除 owner/subject 唯一约束

拒绝。没有当前代标识、lineage 与部分唯一索引时，多个 active item 会产生读取、反馈和决策歧义。

### 在 revision 内增加 generation

拒绝。generation 区分的是独立 item 生命周期，不是同一 item 的内容修订。把它放进 revision 会让终态继续追加新内容，实质仍是复活。

### 新代继承旧 feedback

拒绝。用户确认或反对的是旧 claim。新 item 必须 unreviewed；旧反馈作为旧代审计历史保留，不自动授权新陈述。

### 终态有 pending request 时同时解决并创建后继

暂不采用。两步显式调用让旧代先形成完整撤回/resolution，再判断新来源是否足以创建新代，降低一次事务跨两个 item 的复杂度并保持可重试。

### 用可变 `is_current` 布尔值

拒绝。`retired_at` 同时提供不可逆生命周期时间，部分唯一索引保护当前性；可反复切换的布尔值容易使旧代重新成为当前。

## 验证

- schema drift 必须锁定 generation/前代/当前代唯一、原子后继、退役只读、严格时刻和来源竞态双向门禁。
- 真实 PostgreSQL 必须拒绝单独退役、非终态退役、退役代修改与反馈旁路，并证明旧/新 item 可分别读取。
- recorded frequency 必须证明失效后新 workout 触发 generation 2，两个并发执行者收敛为 created + no-op，账户删除全部代零残留。
- training availability 必须证明新 goal 的 pending request 先在旧终态解决，下一调用才创建 generation 2，新 claim 使用新来源且旧代保持终态。
- 完整测试、typecheck、生产构建、依赖审计、双端质量、中文文档、Obsidian 和 Git 差异门禁通过后才能提交。

## 关联

- [ADR-0178：Personal Model item/revision 持久内核](0178-personal-model-item-revision-persistence-core.md)
- [ADR-0182：Personal Model 来源资格与撤回刷新协议](0182-personal-model-source-qualification-refresh.md)
- [ADR-0184：完整本地周已记录训练频率确定性派生](0184-recorded-training-frequency-deterministic-deriver.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 191 轮档案](../../iterations/191-personal-model-item-generation-lifecycle.md)
