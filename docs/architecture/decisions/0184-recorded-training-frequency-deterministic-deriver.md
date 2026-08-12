# ADR-0184：完整本地周已记录训练频率确定性派生

日期：2026-08-12

状态：已采纳

## 背景

Personal Model 已能从本人当前 onboarding goal 形成训练可用性 Constraint，但该场景只是本人确认资料的镜像，不能证明系统能从纵向记录形成一种可撤回的观察。共享契约已经预留 `recorded_training_frequency_behavior_v1`，来源层也能把 workout 更正或删除登记为 refresh request；缺少的是对观察窗口、覆盖门槛、Unknown、语义无操作、证据撤回和终态的统一执行。

训练记录天然存在选择偏差。账户建立不表示用户从此完整记录现实训练，没有记录也不能直接解释为没有训练。窗口还必须尊重当前资料时区和夏令时边界，不能把本地自然周简化成固定 168 小时。首个纵向场景因此只描述“已记录课次频率”，不推断依从性、习惯、动机、偏好、现实总训练量、效果或医疗含义。

## 决策

1. 在 API Personal Model 模块内建立无数据库依赖的纯 `deriveRecordedTrainingFrequency()`。输入为 owner、评估时刻、完整本地周窗口、当前合格 workout revisions、可选当前模型 revision、待撤回来源、服务端身份和 SHA-256 提供方；输出严格区分 Unknown、created、revised 与 no-op。
2. 观察窗口使用当前 profile 的 IANA 时区。账户建立所在的部分首周与当前进行中的周都不进入统计；从可观察范围内取最近至多 8 个完整周。窗口用本地日期与转换后的绝对时刻共同表示，允许跨 DST 的周不是固定 168 小时。
3. 账户生命周期只证明数据库观察的可能起点，不证明现实记录完整。没有一个完整周时返回 `insufficient_coverage` Unknown；已有完整周但没有当前合格 workout 时返回 `no_eligible_evidence` Unknown。首次 Unknown 不创建 item，也绝不构造零频率 Behavior。
4. 一旦存在正向记录，派生器生成每个完整周的已记录课次、合格总数、出现记录的周数、中位数、最小值和最大值。完整周少于 4 或合格训练少于 6 时状态为 candidate、置信为 low；两项都达到门槛时状态为 active、置信为 moderate。
5. 当前只有一个滚动窗口，没有跨窗口复现证据。所有非终态结果都保留 `single_window` limitation，`comparedWindowCount` 与 `stableWindowCount` 均为零。candidate 或 disputed 继续不能驱动计划；active 也只能表达当前窗口的已记录行为，不能被展示为稳定习惯。
6. 证据只接受窗口内当前未删除 workout 的精确 current revision。同一 workout 不得出现多个当前修订；本地日期、周位置、绝对边界、source kind 和开始/结束时刻都必须严格一致。每周最多接受 100 个合格课次，总引用最多 800 条，异常输入失败关闭。
7. Evidence fingerprint 覆盖策略、owner 与去除随机 reference ID 后的有序引用语义；derivation fingerprint 覆盖策略、claim、状态、置信、反馈、有效期和 evidence fingerprint。随机 item/revision/reference UUID、评估时刻与数据库行号不构成语义变化。
8. 当前 claim、精确窗口时刻、时区、证据指纹与派生指纹全部一致时返回 no-op。窗口推进、来源更正、来源删除或内容修复追加完整 revision。来源更正保留旧引用身份并转为 withdrawn，再加入当前 revision；每个 pending request 必须精确命中旧 eligible 引用。
9. 证据变化时不继承旧 confirmed/uncertain；明确 `disagreed` 继续保持 disputed，仍有效的 temporary 才保留。最后一条合格训练消失时，旧条目追加 invalidated revision、全部旧引用转为 withdrawn，并同时返回 `no_eligible_evidence` Unknown 收据。
10. `invalidated`/`superseded` 不复活。终态没有待办时返回 no-op；终态收到迟到来源撤回时追加相同终态的审计 revision，撤回精确引用并允许仓储形成 resolution，但不采用新 claim。
11. repository 的 `refreshRecordedTrainingFrequency(userId)` 在 READ COMMITTED 事务先锁 active owner，再读取 item/current/pending。之后一条 SQL 同时读取账户建立时刻、当前 profile 时区、当前 workout 和精确 current history，生成评估时刻、完整周边界与有序来源快照。
12. owner 锁串行化同一账户的两个派生执行者。若训练在观察语句之后、提交之前变化，既有来源资格延迟门禁会拒绝旧引用；若训练在模型提交之后变化，workout revision 触发器会登记 refresh request。无需通过更高隔离级别保留等待 owner 锁之前的旧事务快照。
13. 本方法保持内部显式调用，不在 workout 写事务中同步执行，不增加控制器、worker、队列、公开 API、客户端或 LLM。来源事实成功保存与认知派生可用性继续解耦。
14. 当前 `(user_id,subject_key)` 唯一约束与终态不可复活共同意味着终态后不能创建同主题新 item。本轮不通过改写终态规避该限制；下一轮先设计并实现可追溯的新代际与唯一当前代。

## 影响

- Personal Model 第一次能从真实纵向 workout revisions 形成受限 Behavior，并随更正、删除和证据耗尽可解释地修订或失效。
- 缺少记录不会被包装成零训练；账户年龄也不会被误当成现实活动记录完整性证明。
- 本地自然周、当前资料时区与 DST 变化成为明确可复算语义，应用层不再用毫秒除法猜周边界。
- active 的 moderate 置信仍有单窗口限制，避免把一次滚动汇总夸大为长期稳定模式。
- owner 串行与提交时来源资格共同覆盖并发，不要求把短小内部事务升级为全局串行化。
- 终态后的新证据目前只能保持 no-op，暴露了数据库主题唯一约束与领域代际之间的真实缺口；后续扩展前必须先解决。
- 没有 API、worker 或客户端意味着用户尚不能看到或校准这条行为；它仍是内部闭环基础，不是上线功能。

## 备选方案

### 把无记录统计为每周零次

拒绝。系统不知道用户是否完整记录现实训练；零数据库行只证明没有合格证据。首次无证据必须返回 Unknown，已有行为证据耗尽则失效旧条目并返回 Unknown。

### 使用最近 56 个固定 24 小时日

拒绝。本地自然周会跨越夏令时切换，绝对时长不恒定。产品周语义必须由 IANA 时区中的本地周一边界决定。

### 账户满 8 周就认为覆盖充分

拒绝。账户生命周期只建立可能观察范围，不证明每次训练都被记录。门槛只限制系统何时可以表达已记录行为，不能提升为现实完整性结论。

### 只按总课次判断 active

拒绝。大量记录集中在很短窗口不应被表达为纵向行为。当前最低门槛同时要求至少 4 个完整周和至少 6 条合格训练，且仍保留单窗口限制。

### 把当前进行中的周加入统计

拒绝。部分周会系统性压低频率并随每次执行漂移；仅统计已经结束的完整本地周可提供稳定重复计算边界。

### 来源删除后直接物理删除模型条目

拒绝。用户需要看到旧认识为何失效，来源更正链也必须可审计。系统追加 invalidated revision 和 withdrawn references，账户级擦除仍从 owner 根节点级联清理全部历史。

### 终态出现新训练时恢复为 active

拒绝。终态在共享状态机中不可复活，直接改写会破坏用户校准和审计含义。新事实应在新的同主题代际中形成，而不是篡改旧 item 生命周期。

### 在每次 workout 写入后同步派生

拒绝。训练事实保存不应依赖认知服务；既有 refresh request 是持久义务。自动重试和调度需要单独的失败、监控与隐私边界。

## 验证

- 纯函数必须覆盖覆盖不足 Unknown、无证据 Unknown、candidate/active 门槛、每周统计、DST 边界、随机身份稳定 no-op、来源更正、旧确认重置、用户异议、证据耗尽失效、终态迟到撤回和错误输入失败关闭。
- 真实 PostgreSQL 必须覆盖缺少 authority、账户覆盖区别、并发只有一个创建者、8 周当前来源、训练更正 request/resolution 精确一次、最后训练删除失效和账户删除零残留。
- Personal Model 契约、来源门禁、repository、workout 相邻测试必须继续通过。
- 完整测试、typecheck、生产构建、生产依赖审计、双端包体、中文文档、Obsidian 和 Git 差异门禁通过后才能提交。

## 关联

- [ADR-0176：Personal Model 核心契约](0176-personal-model-core-contract.md)
- [ADR-0182：Personal Model 来源资格与撤回刷新协议](0182-personal-model-source-qualification-refresh.md)
- [ADR-0183：训练可用性确定性派生与刷新执行](0183-training-availability-deterministic-deriver.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 190 轮档案](../../iterations/190-recorded-training-frequency-deterministic-deriver.md)
