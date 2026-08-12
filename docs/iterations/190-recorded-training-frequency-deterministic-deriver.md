# 第 190 轮：已记录训练频率确定性派生与来源刷新

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只完成首个纵向 Personal Model P3 场景：由账户建立后最近至多 8 个完整本地周内的当前 workout revisions 派生 `recorded_training_frequency_behavior_v1`。没有完整周或没有合格训练必须返回不同 Unknown 原因，不得把缺失记录当作现实零训练；正向证据按最低周数与课次数形成 candidate 或 active，并明确只描述“已记录课次”。相同语义必须 no-op，训练更正/删除必须消费精确 refresh request，最后证据消失必须失效旧 Behavior，用户异议和终态不得被自动覆盖。

验收还要求当前 profile 时区、本地周一边界、跨 DST、current non-deleted exact revision、并发单发布、账户删除和迟到终态刷新受检。实现保持 API 内部显式调用，不新增控制器、worker、客户端、LLM、真实提供方或云资源。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/personal-model/personal-model-recorded-training-frequency.ts`
  - 新增数据库无关纯派生器，返回 Unknown、created、revised 或 no-op。
  - 校验完整本地周、IANA 时区、DST 绝对边界、训练本地日期/周位置、每个聚合唯一当前 revision 和引用上限。
  - 计算每周已记录课次、合格总数、记录周数、中位数、最小值与最大值；不足 4 周或 6 次为 candidate，达到门槛为 active。
  - 生成 evidence/derivation SHA-256 语义指纹，排除随机 UUID 和执行时刻。
  - 实现来源更正/删除撤回、反馈继承、最后证据失效、Unknown 收据和终态迟到待办消费。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增内部 `refreshRecordedTrainingFrequency(userId)` 与缺少 observation authority 的失败类型。
  - owner 锁后读取 current/pending；用单条 SQL 从账户、当前 profile 与当前 workout/history 生成最近至多 8 个完整本地周观察。
  - 复用现有 revision/evidence/resolution 原子写入；首次 Unknown 不创建 item，重复语义不写历史，来源变化精确解决待办。
- `apps/api/src/personal-model/personal-model-recorded-training-frequency.test.ts`
  - 新增 12 项纯函数测试，覆盖 Unknown、门槛、统计、DST、no-op、来源更正、确认重置、异议、失效、终态迟到撤回和输入失败。
- `apps/api/src/personal-model/personal-model-recorded-training-frequency.integration.spec.ts`
  - 新增 5 项真实 PostgreSQL 测试，覆盖 authority、覆盖区别、并发创建、训练更正、最后训练删除和账户擦除。
- ADR-0184、Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 账户建立时刻只用于判断系统从何时开始“可能观察”，不被当成记录完整性证据。账户建立所在的不完整首周被排除；当前进行中的周也被排除，避免部分周系统性压低频率。
2. SQL 使用当前 profile 的 IANA 时区在数据库中计算本地周一，并把本地边界转换为精确 `timestamptz`。纯函数再次核对本地日期范围，因此跨夏令时的一周可以是 167 或 169 小时，而不是被错误固定成 168 小时。
3. 首次没有完整周返回 `insufficient_coverage`；存在完整周但没有当前训练返回 `no_eligible_evidence`。两种情况都不创建 item，确保未知不伪装成零行为。
4. 一旦存在正向训练，完整周中的零课次可以作为已定义观察窗口的一部分进入周数组，但结论始终命名为 recorded frequency，不能解释为现实总训练。少于 4 周或 6 次只形成 candidate；active 仍保留 `single_window` 限制。
5. SQL 只连接 workout 当前 revision 和未删除当前行，纯函数再拒绝同一聚合多 revision、错本地日期、错周索引、窗口外时刻和异常密度。共享数据库来源资格门禁在提交时重复证明 current revision。
6. 指纹把身份与语义分开。Evidence 指纹不包含 reference UUID，derivation 指纹不包含 item/revision UUID、派生时刻或数据库行号；同一窗口、claim 与精确来源重复执行才能真正 no-op。
7. 窗口推进或来源更正时，旧 eligible 引用离开当前集合后成为 withdrawn context；当前训练加入 supporting eligible。待办必须逐一命中旧聚合与 revision，repository 由现有写入路径原子形成 resolution。
8. 材料变化后，旧 confirmed/uncertain 不会替用户确认新 claim；明确 disagreement 继续 disputed，仍有效 temporary 才保留。最后来源删除时旧条目追加 invalidated revision，并返回 Unknown 收据说明现在没有合格证据。
9. 终态不会因为新训练复活。若只有新证据而无待办，结果为 no-op；若有迟到来源撤回义务，追加一版同终态历史并解决请求。这既保持状态机，也避免持久待办悬空。
10. repository 使用 READ COMMITTED，先锁 active owner，让同账户并发派生者串行；之后用一条语句观察时区、窗口与训练来源。观察后到提交前的训练变化由延迟来源资格门禁拒绝，提交后的变化由触发器登记新待办。

## 4. 验证证据

- 定向纯派生测试 12/12 通过；真实 recorded training frequency executor 集成 5/5 通过。
- 完整单元 104 个文件/623 项通过；真实 PostgreSQL 集成 26 个文件/154 项通过。
- 工作区 typecheck、生产 H5/API/admin 构建与 WeApp 构建通过；生产依赖审计保持 0 个 critical/high 与 9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 数据库应用并核验 41 个迁移；集成清理后 item/revision/evidence/request/resolution 五类 Personal Model 表均为 0，既有 goal 历史保持 2 条 complete 与 1 条 checkpoint_only。
- 中文文档、迁移索引、格式与 Git 差异检查通过：`docs/` 共 404 份 Markdown，第 090–190 轮 101 份档案和 ADR-0085–0184 100 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像已同步并逐字节验证：72,203 字节，SHA-256 为 `a9e37e559aef97256777e0c7979f6d160caf94f6bcfed0d901ae63e8107f5ed7`；仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 浏览器行为和公开 OpenAPI 未改变，因此沿用 95 项浏览器基线；本轮不据此宣称 Personal Model 已有用户入口。

纯函数证明确切领域边界不依赖数据库夹具：窗口不足与证据不足产生不同 Unknown；有正向记录时，周数组、中位数、范围和门槛可重复计算；随机身份和晚一小时执行不制造伪历史。跨 DST 用例证明本地自然周与绝对小时数分离。训练 revision 推进会留下旧 withdrawn 和当前 eligible 引用，旧确认重置、明确异议保留；最后来源删除产生终态与 Unknown，迟到撤回只更新终态审计而不复活。

真实 PostgreSQL 证明执行边界使用真正的账户建立时刻、资料时区、当前 workout 与不可变 history。两个执行者同时处理同一账户时只有一个创建，等待者锁后重读并 no-op。训练更正产生的一条 request 只形成一条 resolution，新 revision 同时保存旧撤回和替代来源。删除最后训练使 item 失效；删除账户后 item、revision、evidence、request 与 resolution 均无残留。

这些证据只说明内部 recorded-frequency 派生器可以安全运行，不说明用户现实训练记录完整，也不校准 4 周/6 次门槛。它没有自动调度、公开 API、页面、回顾或导出；因此不能宣称系统已经在产品界面“了解用户”，更不能让这项统计自动修改训练计划。

## 5. 发现的问题与经验

- “数据库没有记录”和“现实没有行为”是两件事。显式 Unknown 是产品诚实性的一部分，不能为了得到数字而填零。
- 本地自然周不能通过固定毫秒长度建模。日期跨度用于证明完整周数量，IANA 时区转换后的绝对时刻用于数据库筛选，两者都必须保留。
- 账户覆盖只是最弱的观察权限，不是数据完整性。即使 8 周账户也可能从未记录；active 只能表达足量正向记录，不能表达完整监测。
- 一个窗口达到门槛仍不等于长期稳定。`single_window`、零比较窗口与零稳定窗口必须保留，未来多窗口比较不能靠悄悄提高置信替代。
- READ COMMITTED 不代表可以分多条语句随意组合快照。owner 锁负责同账户执行者顺序，单条来源观察负责内部一致，数据库延迟门禁和 refresh request 负责观察两侧的并发变化。
- 终态仍可能收到来源义务。安全策略是追加同终态撤回历史并解决待办，不复活、不丢弃请求，也不直接修改旧 revision。
- 当前 `(user_id,subject_key)` 唯一约束与终态不可复活产生真实生命周期缺口：之后出现充分新证据也不能创建同主题新 item。不能靠恢复旧状态掩盖它，必须设计显式代际。
- API 内部纯派生器继续避免把 Node crypto 和服务端逻辑加入双端客户端依赖图；本轮双端包体理论上应保持稳定，仍须用实际构建证明。

## 6. 全局状态、项目反思与下一步

Personal Model P3 现在有两个性质不同的场景：training availability 保存本人确认 Constraint，recorded training frequency 保存系统对有限记录的 Behavior。它们共同使用同一不可变 item/revision/evidence、用户反馈、来源撤回和 owner 隔离内核，却保持本人事实与系统观察的语义差异。首个纵向行为已经能从真实 workout 来源创建、重复 no-op、随更正刷新、随证据耗尽失效，并诚实表达 Unknown。

当前最重要的阻塞不再是频率统计本身，而是主题生命周期。数据库只允许 owner/subject 一条 item，领域又禁止终态复活；若用户删掉旧证据后过一段时间重新开始记录，系统需要保留旧失效历史，同时允许新一代认识形成。下一轮只解决这一代际边界，明确 lineage、唯一当前代、旧代读取、来源请求归属、反馈目标和账户删除，再继续训练时长 Baseline。

Weekly Cognitive Review、公开 API、客户端、Personal Model 便携导出、自动调度和 LLM 继续后置。没有用户可见证据追溯与校准入口前，内部派生能力仍不是完整的“认知镜子”；没有真实纵向数据与专家/用户研究前，门槛也只是保守工程基线，不是经验证的健身结论。

## 7. 参考

- [第 189 轮档案](189-training-availability-deterministic-deriver.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0184](../architecture/decisions/0184-recorded-training-frequency-deterministic-deriver.md)
