# 第 192 轮：已记录训练课次时长确定性基线

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只实现第三个严格 Personal Model claim：`recorded_session_duration_baseline_v1`。它必须使用账户建立后的最近至多八个完整本地周和当前未删除 workout revision，以绝对开始/结束时刻计算已记录课次的 elapsed minutes，并固定产出样本数、覆盖周数、中位数与 nearest-rank Q1/Q3。少于一个完整周或没有合格时长返回显式 Unknown；有样本但少于六次或覆盖少于四周只形成 candidate；满足两项门槛才 active。

合格课次必须开始与结束都落在观察窗口内，历时严格为正且不超过 1,440 分钟。零历时、异常超长和结束跨越窗口上界的记录不进入统计，不被解释为零训练。执行链必须复用精确来源撤回、语义 no-op、反馈继承、证据耗尽失效、终态不复活、generation+1 原子后继、owner 并发串行和账户删除边界。本轮不新增迁移、公开 API、客户端、自动调度、Weekly Cognitive Review、模型导出、LLM 或云资源。

产品含义固定为“已记录训练课次的历时时长基线”；不得推断现实训练覆盖、能力、强度、有效刺激、训练质量、效果、依从性、最佳时长或下一次建议。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/personal-model/personal-model-recorded-session-duration.ts`
  - 新增无 I/O 的确定性规则引擎，独立验证 owner、时间、完整周、来源唯一性、窗口位置和待撤回义务。
  - 固定 `recorded-session-duration-derivation-v1` 与 `recorded-workout-duration-evidence-v1` 指纹策略。
  - 形成 Unknown/create/no-op/revised、candidate/active/disputed/invalidated、反馈保持与终态刷新状态机。
  - 使用 numeric median 和 nearest-rank Q1/Q3；不调用数据库 percentile 或第三方统计库。
- `apps/api/src/personal-model/personal-model-recorded-session-duration.test.ts`
  - 新增 9 项纯函数测试，覆盖统计原样本、DST、异常/跨界排除、语义稳定、来源更新、异议、失效和非法输入。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增 `refreshRecordedSessionDuration(userId)` 与缺少 authority 的专用错误。
  - 复用频率场景的账户/资料完整周 SQL、当前 workout revision 快照、owner 行锁、请求/解决账本、revision/evidence 持久和代际事务。
  - 终态新代只在新精确来源自身拥有合格历时时创建，避免零或异常时长触发空后继。
- `apps/api/src/personal-model/personal-model-recorded-session-duration.integration.spec.ts`
  - 新增 6 项真实 PostgreSQL 测试：authority、Unknown、并发创建、精确分位、来源更正、删除失效、账户清理和终态第二代。
- ADR-0186、Personal Model、架构、数据库、接口、PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. repository 先锁定 active owner，再读取未退役 `training.recorded_session_duration` 当前代。不存在 item 时生成候选身份但不立即持久化；Unknown 不制造空 item。
2. SQL 从账户建立时刻计算第一个完整本地周，结束于当前本地周周一，向前最多八周。账户恰好在周一零点建立时该周可计入，否则从下一个完整周开始。
3. workout 必须未软删，历史 action 不能为 deleted，且只连接聚合当前 revision。JSON 快照再由共享 `workoutSchema` 解析，防止数据库字段与修订快照不一致时静默派生。
4. 纯函数核对开始时刻所在本地日期、weekIndex 与完整周位置。资格另外要求结束时刻不晚于窗口上界；该规则在终态新证据判断中同步使用，保证 repository 不会为纯函数随后排除的异常记录切代。
5. elapsed minutes 是两个绝对时刻的毫秒差除以 60,000，因此 DST 跳变不会按墙上钟面误算。正数与一天上界只做资格过滤，不截断、不取绝对值、不自动更正来源。
6. 排序后的奇数中位数取中间值，偶数中位数取中间两值平均。nearest-rank 使用 `ceil(p*n)-1`，因此六个样本 `[20,30,40,50,60,90]` 得到 Q1=30、median=45、Q3=60。
7. 覆盖周数来自合格样本的 weekIndex 去重，不使用整个窗口周数冒充有证据覆盖。active 同时要求 `sampleCount>=6` 与 `coveredWeeks>=4`；其他正向样本保持 candidate/low。
8. evidence fingerprint 忽略随机 reference ID，但保留 owner、workout aggregate/revision、来源类型、资格和实际时间区间；相同来源与 claim 的重复执行稳定 no-op。
9. 来源更正/删除沿既有 refresh request 进入派生器。旧 eligible 引用变为相同原因的 withdrawn context；新的合格 revision 加入 supporting 并重算。全部证据失去资格时当前 item 终态 invalidated，历史引用保留。
10. confirmed 或 uncertain 不自动授权变化后的统计；语义变化回到 unreviewed。用户明确 disagree 保持 disputed 和 `user_disputed`，不会因新样本自动推翻。
11. 终态存在待办时只完成旧代撤回修订与 resolution；待办清空后，前代从未引用的新合格精确来源才允许 generation+1。owner 锁使并发执行收敛为 created + no-op。
12. 三个 claim 仍无控制器与公开读取。内部 method 的存在不表示用户可见，也不改变 OpenAPI、客户端包体或 AI 决策路径。

## 4. 验证证据

- 时长纯函数定向测试 9/9 通过；与频率纯函数合计 21/21 通过。
- 时长真实 PostgreSQL 定向测试 6/6 通过；与频率场景合计 12/12 通过。
- 完整单元测试 105 个文件、635 项通过。
- 完整 PostgreSQL 集成测试 27 个文件、162 项通过。
- 工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 浏览器和 OpenAPI 未改变，沿用 95 项浏览器基线；本轮不据此声称存在用户可见 Personal Model 页面。
- 数据库已应用并核验 44 个迁移；集成清理后 item/revision/evidence/request/resolution 五类 Personal Model 表均为 0。
- 中文文档与迁移索引通过：`docs/` 共 408 份 Markdown，第 090–192 轮 103 份档案与 ADR-0085–0186 102 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像已同步并逐字节验证：72,038 字节，SHA-256 `d922ca9abb8a8bcd54da22047365046907a01a785860027406122d837218eac2`；仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 格式与 Git 差异检查在提交前再次完成。

一次时间边界复核发现，仅检查 startedAt 落窗会把结束越过窗口上界的课次纳入所谓“完整周”。实现随后同时约束 endedAt，并让终态新证据资格使用相同条件；新增用例证明跨界课次得到 `no_eligible_evidence`，不会创建 Baseline 或新代。这是本轮在全量回归后追加的正确性收紧，定向测试和 typecheck 已重新运行。

## 5. 发现的问题与经验

- 完整观察窗口必须同时约束区间两端。只按开始时刻筛选适合事件计数，却不足以证明区间型时长样本完整落窗。
- 频率与时长可以共享来源查询，但不能共享资格结论：零历时 workout 对频率仍是一条已记录课次，对时长却不是合格样本。两个 subject 独立保存正好表达这种区别。
- 异常值处理必须区分“有资格但极端”和“语义无效”。一天以内的长课仍按真实值进入分位数；零值、超过一天或跨界课次直接不合格，不能静默截断成看似正常的数字。
- nearest-rank 与连续插值的结果不同，不能只写“quartile”而不保存算法版本和原始样本测试。固定算法使历史 claim 可复现，也为未来策略升级保留显式版本边界。
- `coveredWeeks` 必须从合格样本计算。把窗口完整周数写入该字段会把没有时长证据的周伪装成覆盖，并错误提升 active 资格。
- 终态换代前的“新证据”判断必须复用派生器资格；仅发现新 workout revision 不够，否则异常来源会触发退役旧代，却无法形成合法后继。
- 账户年龄、样本数和覆盖周只证明数据库中可观察到的记录，不证明现实生活记录完整。文档与未来 UI 必须持续使用“已记录”限定词。

## 6. 全局状态、项目反思与下一步

Personal Model P3 的三个首批严格 claim 现已全部拥有确定性执行链：本人确认的训练安排 Constraint、完整本地周已记录频率 Behavior、完整本地周已记录课次历时 Baseline。它们共享 owner 隔离、不可变 revision/evidence、精确来源撤回、用户校准、终态不复活和原子新代际，同时保留独立 subject 与资格语义。系统现在能安全地产生内部认知条目，但用户还不能按主题可靠地看到“当前是哪一代”，更不能理解旧代为何结束。

下一轮只建立 P4 前置的最小内部读取信封：按 owner/subject 返回唯一未退役当前代，携带 generation、直接前代、当前精确 revision、终态和退役元数据；不存在主题返回明确空结果，跨 owner 或数据库歧义失败关闭。它仍不是公开 API，也不一次完成 lineage 分页、证据分页、HTTP 错误隐藏或客户端。

Weekly Cognitive Review、公开 Personal Model API、客户端、便携模型导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。只有当前主题读取、历史解释、用户授权和导出边界逐步完成后，产品才有资格进入用户可见认知镜子。

## 7. 参考

- [第 191 轮档案](191-personal-model-item-generation-lifecycle.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0186](../architecture/decisions/0186-recorded-session-duration-deterministic-deriver.md)
