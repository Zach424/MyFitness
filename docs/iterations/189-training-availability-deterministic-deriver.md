# 第 189 轮：训练可用性确定性派生与刷新执行

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只完成首个 Personal Model P3 场景：由本人当前 onboarding goal 精确 revision 创建 `training_availability_constraint_v1`，相同事实返回 no-op，goal 更正时消费既有 refresh request 并生成旧 withdrawn context、当前 eligible 来源与 resolution。系统必须保留用户不同意和终态，不把旧确认静默转给新 claim；并发执行只允许一个发布者，账户删除无残留。

本轮不实现 workout 纵向 Behavior/Baseline、Weekly Cognitive Review、控制器、后台调度、公开 API、客户端、模型导出或 LLM 调用，也不从资料推断动机、偏好、依从性和效果。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/personal-model/personal-model-training-availability.ts`
  - 新增数据库无关纯派生器，严格输出 created/revised/no-op。
  - 生成本人确认 claim、精确 evidence、资格计数、语义 evidence/derivation SHA-256 和完整 revision。
  - goal 更正保留旧 withdrawn reference，并按异议、temporary、旧确认和 terminal 分别处理反馈/状态。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增内部 `refreshTrainingAvailability(userId)`，owner 锁后读取 profile、当前 goal、item 与 pending requests。
  - 首次创建、内容对账和来源刷新复用既有 revision/evidence/resolution 原子写入；错 request 或待办旁路失败关闭。
  - 使用 Node 标准 SHA-256 注入纯派生器，不向客户端共享依赖图加入服务器运行时。
- `apps/api/src/personal-model/personal-model-training-availability.test.ts`
  - 覆盖创建、随机身份不影响指纹、no-op、收据对账、来源更正、异议、旧确认、terminal、时间顺序和错误散列提供方。
- `apps/api/src/personal-model/personal-model-training-availability.integration.spec.ts`
  - 真实 PostgreSQL 覆盖无来源、创建/no-op、双并发单修订、request/resolution 精确一次、disputed 保留与账号删除。
- ADR-0183 与 Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 把资料事实与认知派生分开。goal revision 仍由 onboarding 事务负责，派生器只读取已提交严格快照，不修改目标或资料。
2. 首次 claim 精确复制可训练日、单次分钟和 source goal revision，明确是 user-confirmed Constraint，不是对实际行为的观察。
3. evidence fingerprint 排除 reference UUID；derivation fingerprint 进一步排除 item/revision UUID 和派生时刻，只覆盖认知语义。这样重试可以 no-op，身份仍由数据库单独审计。
4. SHA-256 作为受检函数参数注入，API 用标准库实现。纯函数可测试，同时不把 Node 专用模块或额外散列代码打进双端客户端。
5. repository 首先锁 owner，再读取所有来源和 item；锁后新查询避免等待者沿旧数据库快照重复创建。第二个并发执行者重读第一位结果并 no-op。
6. 来源刷新必须命中当前 eligible goal 和唯一未解决 request。新 revision 的第一条引用保留旧 identity 并转为 withdrawn，第二条才是当前 eligible；resolution 由既有仓储路径原子追加。
7. 材料变化时不继承旧 confirmed/uncertain。用户 disagree 保留 disputed；只有在本次派生评估时刻仍有效的 temporary 才保留；过期 temporary 回到 unreviewed；terminal 只撤回旧材料且不采用新 claim。
8. 方法保持内部显式调用，不在 onboarding 写入后同步执行，也不增加失败重试或定时器。来源写事务短且独立，自动消费策略留待后续。

## 4. 验证证据

- 纯派生器定向测试 11/11 通过，其中同一用例同时证明有效 temporary 保留、评估时已过期 temporary 重置；Personal Model 契约、schema drift 与派生器组合的最终数量见全量验证。
- 真实 training availability executor 集成 4/4 通过；Personal Model repository + onboarding 相邻集成 23/23 通过。
- 真实 PostgreSQL 已证明首次创建、重复 no-op、两个并发调用产生 revised + no-op、旧/新来源顺序、唯一 request/resolution、disputed 保留和账户删除五类表零残留。
- 完整单元 103 文件/611 项、真实 PostgreSQL 集成 25 文件/149 项通过；工作区类型检查、生产构建与 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high、9 个已登记 moderate；H5 实测总量/入口/最大异步分别为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面分别为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 数据库已应用并核验 41 个迁移；集成清理后五类 Personal Model 表均为 0，目标历史保留 2 条 complete 与 1 条 checkpoint_only，当前目标与历史精确修订错配为 0。
- 中文文档、迁移索引、格式与 Git 差异检查通过；文档索引覆盖 402 份 Markdown、第 090–189 轮 100 份档案和 ADR-0085–0183 99 份决策，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节核验一致：71,682 字节，SHA-256 为 `6fcd1d94ecf99dd7486ef5259edfa0de0c2c05a6469fc6db7367fec2a2304846`；仓库内 `docs/PROJECT_STATUS.md` 继续是权威副本。

纯函数测试负责证明业务判断不依赖数据库状态：同一来源与同一内容必须稳定返回无变化；来源版本推进时必须明确撤回旧证据；用户异议、临时情境和终态各自遵守不同的继承边界。这里还特意更换随机身份，确认内部编号变化不会伪装成认知变化。临时情境则以实际评估时刻为界，防止后台处理延迟后仍继承已经结束的短期说明。

数据库集成测试负责证明原子性与并发顺序。两个执行者同时处理同一账户时，只有先取得账户锁的一方能够发布，等待方会在锁后重新读取并得到无变化结果。来源更正产生的待处理义务只能被解决一次，旧证据、新证据、新修订和解决记录必须一起成功或一起回滚。删除账户后，模型条目、历史、证据、请求与解决记录都不得残留。

类型检查和生产构建证明新执行路径没有破坏工作区边界；双端包体应保持逐字节测量稳定，因为派生器只存在于服务端内部模块，没有进入共享客户端入口。中文、迁移索引、格式与差异检查证明本轮说明、决策和档案可由下一轮复现，而不是只存在于当前会话。

这些结果只证明内部确定性执行器可用，不能据此宣称用户已经能在页面看到个人模型，也不能宣称系统已经学会长期训练规律。没有公开读取接口、自动调度、周回顾和用户校准界面之前，该能力仍是下一阶段的可靠基础，不是完整产品闭环。

## 5. 发现的问题与经验

- no-op 指纹不能包含每次生成的 UUID 或运行时刻，否则技术身份会伪装成业务变化。身份用于关系，语义字段用于变化判定，两者必须分开。
- 用户确认绑定具体 claim。来源内容改变后自动保留 confirmed 等于替用户确认新说法；只有明确异议和仍有效 temporary 可以安全继承。
- terminal revision 仍可能收到来源撤回义务。安全处理是追加同 terminal 状态的撤回历史，不因新来源自动复活，也不让 request 永久悬空。
- 创建前没有 item 行可锁；owner 行是稳定且删除同根的串行点。锁后重新读取 profile/goal/item，既防双创建，也避免来源变化与消费使用不同快照。
- 共享 domain 总入口供客户端使用，且 WeApp 余量很小。尚未开放的服务器派生器保持 API 模块内纯函数，比把它导出到共享入口更符合当前交付边界。
- request 是持久义务，不应在 onboarding 写事务内同步执行派生。事实写入成功和认知服务可用性分离，后续 worker 才能安全重试。
- 第一次运行定向集成时 Docker Desktop 未启动；恢复本地服务后用例通过。这是环境前置，不是代码回退理由，归档只采用真实执行结果。

## 6. 全局状态、项目反思与下一步

Personal Model 现在第一次从“可持久化的模型结构”变成“能由真实来源确定性形成和更新的一条认识”。本人 goal 可以产生可追溯 Constraint，重复运行不制造历史，目标变化有清晰撤回链，用户校准不会被系统吞掉。这证明 Evidence → Personal Model Item → Feedback → Model Revision 的最小内部机制已经能够运行一个可靠场景。

但该场景仍是本人确认资料的镜像，不能证明系统随长期记录更了解用户。下一轮只实现 `recorded_training_frequency_behavior_v1` 纵向派生：使用完整本地周和合格 workout revisions，严格区分缺失记录与零行为，并按最低覆盖形成 candidate/active 或 Unknown。回顾、API、客户端和 LLM 继续后置。

## 7. 参考

- [第 188 轮档案](188-personal-model-source-qualification-refresh.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0183](../architecture/decisions/0183-training-availability-deterministic-deriver.md)
