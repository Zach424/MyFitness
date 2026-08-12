# ADR-0186：已记录训练课次时长确定性基线

日期：2026-08-12

状态：已采纳

## 背景

共享 Personal Model 契约已经固定 `recorded_session_duration_baseline_v1`，但此前只有 Schema 示例，没有规则引擎或真实来源事务。若直接把 workout 的开始与结束字段展示为长期认识，会留下多个歧义：当前周的未完整数据可能进入纵向窗口；开始在窗口内但结束越界的课次可能被错误纳入；零历时和异常超长记录可能污染分位数；时长还容易被误解为能力、强度、有效刺激、训练质量或推荐处方。

第 190 轮的频率 Behavior 已建立账户覆盖、完整本地周、当前 workout revision、来源撤回和证据耗尽协议；第 191 轮又建立终态后的原子新代际。本轮应复用这些边界，并只增加一个独立、严格、可重算的时长 claim，避免另建窗口权威或把频率与时长合并成无法独立校准的条目。

## 决策

1. 新增纯函数 `deriveRecordedSessionDuration()` 和 repository 方法 `refreshRecordedSessionDuration(userId)`。条目固定为 Baseline、`training.recorded_session_duration`、`recorded_session_duration_baseline_v1` 与 `deterministic_rule`。
2. 观察窗口复用频率场景的账户建立时刻、资料 IANA 时区、周一边界和最近至多八个完整本地周。首个不完整账户周不计入，当前进行中的周不计入。
3. 来源只读取当前未删除 workout 及其当前精确 revision。课次开始时刻必须落在窗口的半开区间内，结束时刻也不得晚于窗口上界；因此跨越完整周窗口末端的课次不进入时长样本。
4. 历时只用绝对开始/结束时刻之差计算分钟，不使用本地墙上时间，也不汇总 set duration。只纳入 `0 < elapsedMinutes <= 1440` 的样本；零历时与超过一天的异常记录不作为合格证据。
5. claim 记录样本数、覆盖周数、Q1、中位数和 Q3。中位数使用 `numeric-median-v1` 等价算法：奇数取中间值，偶数取中间两值平均；Q1/Q3 使用 `nearest-rank-quartiles-v1`，索引为 `ceil(p*n)-1`，不插值。
6. 至少六个合格样本且覆盖至少四个不同完整周时状态才为 active、置信为 moderate；有正向样本但未达到任一门槛时为 candidate/low，并公开 `limited_coverage` 与 `single_window`。无完整周返回 `insufficient_coverage` Unknown；有完整周但无合格样本返回 `no_eligible_evidence` Unknown，不持久化零行为条目。
7. 证据引用继续绑定 workout aggregate/revision、实际起止区间和来源类型。随机 reference/item/revision 身份、执行时刻变化不改变语义指纹；相同 claim 与证据返回 no-op。
8. workout 更正或删除产生既有不可变 refresh request。下一 Baseline revision 必须把旧引用变为相同理由的 withdrawn context，并在同一事务形成 resolution；替换 revision 若合格则作为新 supporting 引用加入并重新计算统计。
9. 证据耗尽使现有 Baseline 进入 invalidated，并返回 Unknown 收据；明确用户异议在语义更新后保持 disputed/user_disputed，confirmed 与 uncertain 不自动继承到变化后的 claim。终态不复活。
10. 终态待办清空后，只有出现前代从未引用的新合格精确 workout revision 才创建 generation+1。owner 锁、部分唯一索引、前代链与退役延迟门禁继续保证并发只有一个后继。
11. 账户删除继续级联清理全部代、修订、引用、请求和解决记录。本轮没有迁移、控制器、自动调度、公开 API、客户端、周回顾或便携模型导出。
12. 产品文字只能称为“已记录训练课次的历时时长基线”。不得称为有效训练时长、典型能力、训练强度、效率、质量、效果、最佳范围、达标情况或下一次建议。

## 影响

- 三个首批共享 claim 现在都有可重现的确定性执行链；记录频率与记录时长共享来源权威，却可独立失效、反馈、换代和审计。
- 完整周窗口、DST 与绝对历时语义避免本地时钟跳变直接改变分钟数；窗口上界同时约束开始和结束，避免部分跨界课次混入历史统计。
- 固定四分位算法消除不同数据库、客户端或统计库默认插值方式造成的漂移。算法版本保存在 claim 中，未来改变算法必须发布新版本并重新派生，不能重写历史。
- 无效时长被排除，不会作为支持或反对证据；这表示当前规则无法可靠解释该记录，不表示课次没有发生或用户没有训练。
- 该 Baseline 仍依赖用户实际记录的覆盖与准确性。数据库账户年龄只是可观察下界，不能证明现实生活的训练完整、连续或具有代表性。
- 内部能力尚无按主题读取信封、HTTP 授权、lineage 分页、导出和用户解释，因此不能宣称 Personal Model 已面向用户完成。

时长分布是一组记录字段的描述，不是身体或人格属性。即使样本充足且状态 active，也只说明当前窗口的已记录课次在固定规则下形成了一个统计摘要；用户漏记短课、只记录正式训练、设备导入偏差或一次特殊长课都可能影响分布。系统不得据此调整计划、评价依从性或把它与训练效果建立因果关系。

## 备选方案

### 直接使用数据库 percentile 函数

拒绝。不同连续/离散百分位函数和插值默认值容易产生实现漂移；纯函数固定算法更容易跨运行时复现，也能用原始样本测试。

### 用 set duration 代替课次起止历时

拒绝。set duration 只存在于部分记录方式，且不包含组间休息、准备或用户定义的课次范围；与当前 claim 名称和共享契约不一致。

### 纳入开始在窗口内但结束越界的课次

拒绝。该课次并未完整落在观察窗口内，会使“完整本地周”只有开始边界而没有结束边界。未来若需要分摊跨界活动，应使用独立版本和明确规则。

### 把零历时当作零分钟样本

拒绝。现有 workout 写入允许相同开始/结束，但它不足以证明真实训练为零分钟；纳入会把数据质量问题伪装成行为事实。

### 对超过一天的记录进行截断

拒绝。静默截断会制造不存在的 1,440 分钟事实。异常记录保持不合格，用户可先更正来源再触发重新派生。

### 与训练频率合并为一个 item

拒绝。频率与时长的缺失、门槛、反馈和失效原因不同；独立 subject 能保持精确证据与用户校准，不让一个维度变化无意义地改写另一个维度。

## 验证

- 纯函数测试覆盖 Unknown、candidate/active、固定中位数与 nearest-rank 四分位、DST 绝对历时、零/超长/跨窗口排除、语义 no-op、来源更正、反馈继承、证据耗尽、终态不复活和错误义务。
- 真实 PostgreSQL 测试覆盖无 authority、账户完整周、并发首次创建、精确统计、workout revision 撤回/替换、request/resolution、删除失效、终态 generation+1 与账户删除零残留。
- 与频率集成文件共同运行，证明一个 workout 更新可为两个不同 subject 各自产生并解决独立来源义务，不发生串扰。
- 完整单元、集成、typecheck、H5/API/admin 与 WeApp 构建、生产依赖审计、双端质量、中文文档、Obsidian 和 Git 差异门禁必须通过后提交。

## 关联

- [ADR-0184：完整本地周已记录训练频率确定性派生](0184-recorded-training-frequency-deterministic-deriver.md)
- [ADR-0185：Personal Model 同主题条目代际生命周期](0185-personal-model-item-generation-lifecycle.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [架构基线](../ARCHITECTURE.md)
- [第 192 轮档案](../../iterations/192-recorded-session-duration-deterministic-deriver.md)
