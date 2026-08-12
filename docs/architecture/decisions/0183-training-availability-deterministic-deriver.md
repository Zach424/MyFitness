# ADR-0183：训练可用性确定性派生与刷新执行

日期：2026-08-12

状态：已采纳

## 背景

Personal Model 已有严格 `training_availability_constraint_v1` 契约、不可变 item/revision/evidence 持久链、onboarding goal 历史，以及来源更正后的 refresh request/resolution 协议。但是这些结构只能证明“某次来源变化必须被处理”，还不能从本人当前目标创建第一条认知，也不能自动构造安全的新修订。继续依赖测试夹具或调用方手写快照会让 claim、证据、指纹、反馈和并发语义分散。

首个派生场景必须保持最小：只把本人明确提交的可训练日与单次时长镜像成 Constraint，不推断实际行为、偏好、动机、依从性、效果或医学含义。本轮也不开放控制器、后台任务、客户端或周回顾。

## 决策

1. 在 API Personal Model 模块内建立无数据库依赖的纯 `deriveTrainingAvailability()`。输入只接受严格 onboarding goal revision、时区、评估时刻、可选当前模型 revision、服务端身份和 SHA-256 提供方；输出严格区分 created、revised 与 no-op。
2. 首次派生固定生成 `constraint + training.availability + user_confirmed + active`，claim 逐字段复制 goal 的 `availableDays`、`sessionMinutes` 与精确 revision。置信固定为本人确认 high，只引用一条 supporting eligible goal revision。
3. Evidence fingerprint 只覆盖策略、owner 和有序来源语义；derivation fingerprint 只覆盖策略、claim、状态、置信、反馈、有效期和 evidence fingerprint。随机 item/revision/reference UUID、评估时刻与数据库行号不进入语义指纹。
4. SHA-256 由调用环境注入，派生器验证结果必须为 64 位小写十六进制。API 使用 Node 标准库；不把 Node crypto 或额外散列实现加入共享客户端依赖图。
5. 当前来源、claim、evidence policy/timezone/fingerprint 和 derivation fingerprint 全部相同时返回明确 no-op，不新增历史。指纹不匹配但来源未变化时允许 content reconciliation，仍追加一版完整受检历史。
6. goal revision 推进时，下一修订保留旧 eligible reference 的身份并转为 `context + withdrawn + source_corrected`，随后加入新 revision 的 supporting eligible reference；claim 的 `validFrom` 从新 goal changedAt 开始。
7. 用户不同意优先：`disagreed` 继续保持 disputed 与 `user_disputed` limitation。只有在本次派生评估时刻仍有效的 temporary 才保留时限；旧 confirmed/uncertain 或已过期 temporary 对新 claim 回到 unreviewed。terminal item 只撤回旧来源，不采用新 claim、不复活。
8. repository 的 `refreshTrainingAvailability(userId)` 在一个事务先锁 owner 行，再读取 profile/current goal/current item 和未解决请求。首次创建复用既有 revision/evidence 原子写入；来源刷新必须与当前 eligible goal 及唯一待办精确匹配，随后复用 resolution 写入。
9. owner 锁是创建前和来源读取的共同串行点。同一 owner 的两个执行者不能同时观察空 item 或旧 goal：等待者在锁后重读，第一位发布，第二位得到 no-op。它也与账户删除形成清晰顺序。
10. 本方法保持内部显式调用。onboarding 写入只生成 request，不同步运行派生；没有定时 worker、队列、控制器或客户端触发。自动调用时机、失败重试和监控必须在后续轮次另行决策。

## 影响

- Personal Model 第一次能由真实本人来源确定性创建并随来源更正形成可解释历史，而不是只有持久化测试夹具。
- 相同语义不增长 revision；随机身份和运行时间不会造成伪变化。
- 用户异议不会被系统刷新覆盖，旧确认也不会被错误继承到材料变化后的新 claim。
- 事务对同 owner 操作采取保守串行化；当前频率低且逻辑短，后续只有在真实锁等待证据出现后才调整粒度。
- 没有 API/worker 意味着产品仍不会自动或由用户界面生成该条目；这是一条内部执行能力，不是用户可见功能。

这项决策把“资料事实”和“系统认识”保留为两个可独立失败的阶段。本人目标一旦保存就成为稳定来源，即使认知派生暂时不可用也不会阻止资料提交；持久待办则保证系统恢复后仍知道哪条旧认识需要重新检查。这样既缩短用户写入事务，也为以后受控重试留下明确边界。

串行化选择优先保证正确性。首次创建时尚不存在可供锁定的模型条目，账户行却始终存在，并与账户删除共享生命周期，因此适合作为当前低频内部执行的共同顺序点。只有观测到真实等待压力后，才有理由引入更细粒度协调；不能先用复杂并发方案换取尚未证明需要的吞吐量。

用户反馈的继承规则遵循“反馈针对具体陈述”原则。用户明确反对时，系统不能仅凭新资料就假定反对已经消失；用户曾确认旧陈述时，系统也不能替用户确认内容已经变化的新陈述。临时情境只有在实际评估时仍处于用户给定期限内才能保留，延迟执行不会延长它的寿命。

## 备选方案

### 在 onboarding 写事务中同步生成模型

拒绝。资料事实保存不应依赖派生服务；当前 refresh request 已提供持久义务，后续可重试消费。同步耦合还会扩大建档事务和错误表面。

### 把派生器放入共享 domain 总入口

拒绝。客户端当前依赖该入口且 WeApp 包体余量很小；尚未开放的服务器执行器不应进入 H5/小程序依赖图。纯函数仍通过模块内分层和独立测试保持领域边界。

### 指纹包含完整快照或生成 UUID

拒绝。运行时刻和身份每次都不同，会让相同业务语义永远无法 no-op。指纹只覆盖决定认知含义的受控字段。

### 来源更正后保留 confirmed

拒绝。用户确认的是旧 claim，不是未来所有目标版本。只有明确 disagreement 和仍有效 temporary 具有跨来源变化的保留语义。

### 刷新时把 disputed 恢复为 active

拒绝。新来源不能推翻用户异议；系统必须保留 disputed，等待用户再次校准。

### 用数据库触发器直接构造模型 revision

拒绝。触发器不应决定 claim、反馈继承或指纹；数据库继续负责来源义务和关系完整性，应用层纯派生器负责产品语义。

## 验证

- 纯函数测试必须覆盖创建、语义指纹稳定、no-op、receipt reconciliation、goal refresh、异议保持、旧确认重置、terminal 不复活、时间顺序和错误 SHA-256 提供方。
- 真实 PostgreSQL 必须覆盖无来源失败、首次创建、重复 no-op、两个并发执行者只有一个新 revision、request/resolution 精确一次、disputed 保留和账户删除零残留。
- Personal Model 契约、schema drift、既有 repository、onboarding 相邻测试必须继续通过。
- 完整测试、typecheck、生产构建、依赖审计、双端包体、中文文档、Obsidian 和 Git 差异门禁通过后才能提交。

## 关联

- [ADR-0176：Personal Model 核心契约](0176-personal-model-core-contract.md)
- [ADR-0181：onboarding goal 不可变修订历史](0181-onboarding-goal-revision-history.md)
- [ADR-0182：Personal Model 来源资格与撤回刷新协议](0182-personal-model-source-qualification-refresh.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 189 轮档案](../../iterations/189-training-availability-deterministic-deriver.md)
