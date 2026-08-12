# 第 191 轮：Personal Model 同主题终态后新代际

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只解决 Personal Model 同主题生命周期缺口：`invalidated`/`superseded` 旧 item 永久保持终态和不可变历史；以后出现前代未使用的新精确证据时，系统可以创建 generation+1 新 item，而不是复活或删除旧 item。每个 owner/subject 同时只能有一个当前代，前代链不能分叉；旧代来源待办、反馈、读取和账户删除必须保持清晰。

验收要求数据库拒绝单独退役、非终态退役、退役代更新/反馈和来源竞态悬空；两个现有派生器必须只使用未退役当前代。训练频率需要证明“最后证据删除失效→新增训练→两个并发调用只有一个第二代”；训练可用性需要证明“终态→goal 更新待办先撤回解决→下一次创建第二代”。本轮不新增共享传输 Schema、公开 API、客户端、worker、LLM 或云资源。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0042_personal_model_item_generation.sql`
  - 为 item 增加 generation、predecessor 与 retired 元数据。
  - 将永久 owner/subject 唯一改为全历史代次唯一和未退役当前代部分唯一。
  - 增加前代同 owner/subject 外键、禁止分叉、终态/待办清空退役、原子后继、退役只读和 feedback 旁路门禁。
  - 来源触发器只扫描未退役当前代。
- `infra/postgres/migrations/0043_personal_model_generation_refresh_race.sql`
  - 增加退役提交时仍无待办、request 提交时仍指向当前代的双向延迟门禁。
- `infra/postgres/migrations/0044_personal_model_generation_strict_times.sql`
  - 在不回改已应用迁移的前提下替换两个函数，要求新代初始未退役、退役时刻严格晚于前代最后修订。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 两个主题查询增加 `retired_at IS NULL`，继续在 owner 锁后选择唯一当前代。
  - 新增私有 `retireGenerationAndInsertSuccessor()`，同事务退役前代、插入 generation+1 item 和 revision/evidence。
  - 终态待办先消费；待办清空且存在前代从未引用的新精确来源时，以新 item ID 和 `currentRevision=null` 调用纯派生器创建 revision 1。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增 3 项静态迁移门禁，锁定代际结构、来源竞态和严格时间增强。
- training availability / recorded frequency 两个真实 PostgreSQL 集成文件
  - 新增 2 项端到端代际测试，并补单独退役、非终态退役、退役修改、反馈旁路、旧/新读取、并发和账户删除断言。
- ADR-0185、Personal Model、架构、数据库、API、PRD、路线图、风险与项目状态同步更新。

## 3. 实现方法

1. generation 是 item 聚合生命周期，不是 revision 内容版本。现有 item 全部回填为 generation 1；完整 revision JSON 不增加字段，避免把代际误当同一陈述的普通修订。
2. `retired_at IS NULL` 定义当前代，部分唯一索引从数据库保证每个 owner/subject 最多一个当前代。全历史代次唯一和前代唯一分别阻止重复 generation 和 lineage 分叉。
3. generation 1 不得有 predecessor；后续代必须连接同 owner/subject 的直接前代，且 generation 恰好加一。新代从 revision 1 开始，使用新 item/revision/reference UUID，feedback 回到 unreviewed。
4. 退役只允许终态、待办已清的当前代，时刻严格晚于旧代最后 updatedAt。延迟 successor guard 要求同一事务存在后继；因此任何原始 SQL 只退役旧代都会在提交时回滚。
5. 旧代一旦 retired，item mutation guard 拒绝任何再次更新。feedback 还有独立 BEFORE INSERT 门禁；普通 revision append 即使插入了新 revision，也无法推进 retired item 指针，事务会共同回滚。
6. 来源触发器只扫描未退役 item；但来源与退役可以并发交错，因此 0043 增加双向提交检查。来源 request 必须仍命中未退役 current revision，退役代在提交时必须仍无 unresolved request；不会出现已经切代但旧代新增悬空义务。
7. repository 继续先锁 owner，使同账户两个代际执行者串行。第一个退役并创建后继；第二个锁后查询只看到新 current generation，按相同来源得到 no-op。
8. 只有“前代从未引用的新精确来源”才允许后继。判断覆盖 eligible 与 withdrawn 全部历史引用，避免同一个旧 revision 在退出/重新进入窗口后反复制造 generation。
9. 训练频率终态通常已经解决删除请求，因此新增 workout 可以直接创建新代。训练可用性的新 goal revision 会先产生绑定旧代的 request；第一次刷新只在旧终态追加 withdrawn 并解决，下一次才切代，保持旧来源义务完整。
10. 明确 item ID 的内部 getCurrent/history 不过滤 retired，因此旧代仍可审计读取。按 subject 选择 current 与公开 lineage 查询尚未开放，不能让客户端自行猜代次。
11. 账户删除依既有 owner cascade 清除所有代、revision、evidence、feedback、request 与 resolution；退役只读门禁允许级联深度删除，不改变隐私生命周期。

## 4. 验证证据

- 代际、来源竞态和严格时间 schema drift 3 项新增测试通过；完整单元 104 个文件/626 项通过。
- training availability 与 recorded frequency 定向真实 PostgreSQL 合计 11/11 通过；完整集成 26 个文件/156 项通过。
- 工作区 typecheck、生产 H5/API/admin 构建与 WeApp 构建通过；生产依赖审计保持 0 个 critical/high 与 9 个已登记 moderate。
- 数据库已应用并核验 44 个迁移。集成清理后 item/revision/evidence/request/resolution 五类 Personal Model 表均为 0，goal 历史保持 2 条 complete 与 1 条 checkpoint_only。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 中文文档、迁移索引、格式和 Git 差异检查通过：`docs/` 共 406 份 Markdown，第 090–191 轮 102 份档案与 ADR-0085–0185 101 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像已同步并逐字节验证：71,922 字节，SHA-256 `0c7f171634e07f3ac951efc75d22f9eb9c10e1df0a783f10d995d06ec4dad19a`；仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 浏览器和公开 OpenAPI 未改变，沿用 95 项浏览器基线；本轮不据此声称用户已有代际页面。

静态门禁证明迁移文本包含全历史/当前唯一、前代外键、原子后继、退役只读、feedback 拒绝、来源仅当前代、退役/来源双向竞态和严格时刻。迁移运行器的校验和纪律也在实现中得到实际应用：发现严格时刻可增强时，没有修改已应用 0042，而是新增 0044 替换函数，防止共享环境出现 migration drift。

真实数据库证明旧终态不能单独退役，active 后继也不能被强行退役；退役旧代无法修改，也无法通过原始 SQL 写 feedback。频率场景在 generation 1 失效后由新 workout 创建 generation 2，两个并发调用只有 created + no-op，predecessor 正确且账户删除全部表零残留。训练可用性先把新 goal request 解决到旧终态 revision，再创建新 active item；旧 generation current 仍可按 ID 读取终态，新 generation 按新 item ID 读取首版。

这些结果只证明内部 item lineage 正确，不证明公开主题读取、分页、导出、用户对“旧认识/新认识”的理解或后台自动重试。代际元数据也没有进入共享 revision Schema；未来公开时必须设计独立、最小、可解释且 owner 授权的 lineage 信封。

本轮还验证了一个重要边界：代际机制只负责保存同一主题随时间演进的不可变历史，不负责替用户判断哪一代“更正确”。前代终态、来源义务清空和新证据出现只是允许创建后继的必要条件；后继仍从未审核状态开始，也仍需要用户反馈与后续来源修订来校准。这样可以避免系统把自动派生结果伪装成用户已确认事实，并让纠错、导出和审计始终能回到当时实际使用的证据与规则。

回滚策略同样保持可逆：应用层若暂时停止创建后继，既有第一代与已创建的后继仍可按 item ID 读取，不需要删除或重写历史；数据库迁移则保留新增列、索引和门禁，避免降级期间重新出现终态复活或来源竞态。未来开放主题级查询时，应先提供明确的当前代与历史代信封，再决定客户端如何展示，不应直接把内部表结构暴露成稳定产品协议。

## 5. 发现的问题与经验

- 终态不可复活与同主题永久唯一同时存在会让产品无法在未来重新形成认识。正确解法是新 item 代际，不是放宽终态状态机。
- current 属于 item lineage，而 revision current 属于 item 内部，两层指针不能混为一谈。部分唯一索引负责当前代，既有 current_revision 负责当前修订。
- 只检查退役动作发生时没有 pending request 不足以覆盖并发来源写入；必须让退役与 request 在事务提交时双向查看对方最终状态。
- 新证据判断必须覆盖前代全部 eligible/withdrawn 引用。只看 eligible 会让已经撤回的相同 revision 被误认为“新”，导致代际重复增长。
- 用户反馈绑定具体 item/revision。新代继承旧 feedback 会相当于替用户确认新陈述；代际创建必须从 unreviewed 开始。
- 数据库迁移一旦应用就不能回改。对 0042 的后续严格性增强使用 0044 替换函数，保留校验和稳定，这比为了减少文件数量修改历史迁移更重要。
- 两步“先解决终态待办、再创建后继”更容易审计和重试，也让来源 resolution 始终属于产生义务的旧 item。
- 旧代按 item ID 保持可读不等于公开 lineage 已设计完成；未来 API 必须明确 current、历史代、每代 revision history 三层关系。

## 6. 全局状态、项目反思与下一步

Personal Model 现在既能让一条认识随证据修订，又能在终态后保留旧历史并以新 item 重新开始。training availability 与 recorded training frequency 两个场景都使用唯一当前代，来源义务和反馈不会跨代混淆，并发与账户删除也有真实 PostgreSQL 证明。这关闭了继续扩展 P3 前最重要的生命周期阻塞。

下一轮只实现第三个严格共享 claim：`recorded_session_duration_baseline_v1`。它应复用当前资料时区、完整本地周和当前 workout revisions，以真实开始/结束时刻计算已记录课次历时、中位数和 nearest-rank 四分位数；覆盖不足保持 Unknown/candidate，active 仍保留单窗口限制。它必须复用来源撤回、证据耗尽、反馈继承、终态与新代际，不推断训练能力、强度、质量或效果。

Weekly Cognitive Review、公开 Personal Model/lineage API、客户端、便携导出、自动调度和 LLM 继续后置。代际解决的是内部历史正确性，不是用户已经能理解或控制个人模型；在用户可见来源追溯、校准、导出和研究完成前，产品仍不能宣称“衡迹已经了解你”。

## 7. 参考

- [第 190 轮档案](190-recorded-training-frequency-deterministic-deriver.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0185](../architecture/decisions/0185-personal-model-item-generation-lifecycle.md)
