# 第 185 轮：Personal Model P2b 反馈事件与结果事务

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只实现 Personal Model P2b：新增 append-only `personal_model_feedback_events`，把精确 owner/item/current revision、四选一用户动作、可选理由/备注、temporary 时限和 revised/no-op 结果收据写入 PostgreSQL；内部仓储必须在一个事务中完成事件与结果，支持相同事件结果安全重放，并拒绝过期目标、跨 owner、事件身份换内容和直接 feedback revision 旁路。

验收必须用真实数据库证明 revised 事件与结果 revision 不可分离，no-op 不生成伪 revision，同事件并发只产生一条事件/结果，原始 SQL 不能改写或提交不完整关系，账户删除仍能清理全部历史。本轮不实现 evidence/review 持久表、公开 API、OpenAPI、派生器或客户端。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0038_personal_model_feedback_event_core.sql`
  - 新增追加式反馈事件及选择、理由、备注、时限、转换版本、结果类型、结果修订和指纹约束。
  - current 目标触发器拒绝过期、倒置或终态事件；no-op 必须已经处于相同反馈状态。
  - 事件→结果 revision 与 revision→事件的双向延迟外键绑定 owner、item、前驱、action、结果修订和指纹。
  - 替换 P2a feedback pending 约束，加入事件/结果唯一性、不可变触发器、读取索引和账户级级联边界。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增 `applyFeedback()`，完整解析 P1b transition，在 item 行锁内持久化 event + revised revision/current 指针或 event + no-op 收据。
  - item 锁与 current revision 读取拆为两个 SQL 语句，等待者在获得锁后读取最新已提交历史。
  - 已存在事件从不可变目标/结果 revision 重建；完全相同则重放，身份换内容则冲突。
  - 条目、证据、revision 与 feedback 的绝对时间只在幂等比较副本中折算，数据库回读不会把语义相同的偏移时间误判为不同事件，也不会改写指纹覆盖的快照。
  - 普通 `append()` 继续拒绝反馈 revision，所有用户动作只能进入反馈事务。
- `apps/api/src/personal-model/personal-model.repository.integration.spec.ts`
  - 从 5 项扩展为 11 项真实 PostgreSQL 测试，新增 revised、no-op、同事件并发重放、偏移时间规范化重放、身份复用冲突、过期/跨 owner、原始 SQL 与 feedback 账户删除证明。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增迁移 0038 保真门禁，锁定 P1b 枚举/版本、pending 替换、双向结果关系、current 目标和不可变事件。
- ADR-0179 与 Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 事件行同时保存用户输入和转换结果的最小收据，不复制完整 item 快照；重放时从不可变 target/result revision 恢复完整 P1b transition。
2. revised 的事件行先声明精确下一 revision，结果 revision 反向引用事件；两条约束都延迟到提交检查，使同一事务可以按清晰顺序插入，又不能只留下其中一侧。
3. no-op 以空结果 revision、固定原因和结果指纹表达，触发器核对目标快照已经处于相同选择状态，避免“无需修订”成为跳过验证的旁路。
4. 仓储先锁 item 身份行，再在锁后发起 current revision 查询。相同 event ID 的并发请求由同一行锁串行化，后到者读取已提交事件并重建结果。
5. 精确重放使用完整结构比较；完全相同才返回已存结果。相同 UUID 改变目标、choice、文字、时限或结果会得到冲突，不能以幂等名义静默替换用户动作。
6. reason、note 与时限不进入日志、指标或错误文案；当前只通过数据库和严格 Schema 保真，公开传输与展示后续另行设计。
7. 事件和 revision 的直接 mutation 都被拒绝；账户 owner 级联由真实测试证明仍可跨循环延迟关系完成清理。
8. RFC 3339 偏移串在比较副本中折算为 UTC 时刻；真实 revision 快照和证据 JSON 保留调用方表示，回读时用快照 `updatedAt` 恢复 revision `changedAt` 并核对数据库时刻。首次写入与相同表示的重放返回同一结构。

## 4. 验证证据

- 迁移 0038 在本地 PostgreSQL 成功应用，`schema_migrations` 连续至 0038；目标测试清理后 item/revision/feedback 三张表均为 0 行。
- schema drift 目标测试 26/26 通过。
- Personal Model 仓储真实 PostgreSQL 集成测试 11/11 通过；API strict typecheck 通过。
- 完整单元测试 102 个文件、595/595 项通过；完整集成测试 24 个文件、141/141 项通过；既有浏览器测试基线仍为 95 项。
- 全仓 strict typecheck、生产构建和生产依赖审计通过，依赖保持 0 个 critical/high、9 个已登记 moderate。
- 客户端质量门禁通过：H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均在既有预算内且无禁用标记。
- 中文、迁移清单、相对链接、Prettier 和 `git diff --check` 门禁通过；`docs/` 为 394 份 Markdown，待迁移总量保持 191，第 090–185 轮与 ADR-0085–0179 连续受保护。
- Obsidian 权威状态镜像同步并独立校验通过：71,685 bytes，SHA-256 `018091b938b2775a48ac32eb59fac3f20d8da6328dc0af46207a99f5f14f3c57`。

## 5. 发现的问题与经验

- 第一版迁移同时给 outcome 列使用匿名 CHECK，又把跨字段约束命名为自动生成的相同名称，PostgreSQL 在同一建表语句中拒绝重名。迁移事务完整回滚且 0038 账本未写入；把跨字段约束改为明确的 relation 名后成功应用，0037 及以前未改动。
- P2a 用一条 `item JOIN current revision FOR UPDATE` 查询同时锁行和读当前历史。在两个相同反馈并发时，等待者可能持有等待前查询快照；先行事务发布新 revision 后，等待者获得 item 锁却无法在原 JOIN 快照中看到新历史，错误表现为 item 不存在。拆成“先锁 item，再新语句读 current”后，同事件并发稳定收敛。
- 普通 `nextRevision` 测试 helper 原先展开上一条 revision，会把 feedback revision 的 event ID 带入后续非反馈动作。显式写 `feedbackEventId: null` 既修复夹具，也强调事件引用只属于产生它的那一条用户 revision。
- 只用事件→结果 revision 外键仍允许 revision 引用错误 choice；反向复合外键同时带 action、前驱、结果修订和指纹，才能在数据库层证明两侧描述同一个转换。
- no-op 不是“不写任何东西”，而是“不写新 revision”。保存追加式事件收据后，未知网络结果才能安全重试，同时不膨胀模型历史。
- 事件 ID 幂等不能放宽内容比较。允许相同 ID 换 note 或目标会把网络恢复机制变成覆盖用户校准的入口。
- `timestamptz` 保存的是绝对时刻而不是原始偏移文本。若首次请求直接返回 `+08:00` 输入、重放却从数据库返回 `Z`，逐字段幂等比较会误报冲突；只规范化比较副本既能识别同一时刻，又避免改写可能参与指纹的快照文本。

## 6. 全局状态、项目反思与下一步

P2b 完成后，Personal Model 已能安全保存用户对某次精确认识的校准，并区分“形成下一修订”和“当前已经一致”。这补齐了 item/revision 历史中最重要的用户权威入口，也用真实并发测试修复了一个 P2a 锁读取竞态。但数据库仍只知道 revision 快照里包含哪些 evidence JSON，尚不能沿来源更正/删除形成可查询、可撤回的关系；Weekly Cognitive Review 也仍只有契约。因此项目继续是内部 Alpha，用户还看不到认知镜子或反馈页面。

下一轮只进入 P2c：把首批 onboarding goal/workout evidence 引用投影为同 owner、同 item revision 的不可变关系，并定义来源更正/删除如何追加 withdrawn 资格和触发后续模型重算，而不改写历史快照。回顾、API、客户端和 LLM 表达层继续拆轮。

## 7. 参考

- [第 184 轮档案](184-personal-model-item-revision-persistence-core.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0179](../architecture/decisions/0179-personal-model-feedback-event-transaction.md)
