# 第 187 轮：onboarding goal 不可变修订历史

日期：2026-08-12

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只补齐 Personal Model P2c 来源绑定的前置条件：为当前 `user_goals` 建立稳定聚合 ID、与 profile 相同的 revision、严格共享快照和不可变历史。每次建档写必须在同一事务推进当前资料/目标并追加精确历史；旧账号无法恢复的早期值必须标为迁移检查点，不能伪造完整链。历史要进入本人便携导出并随账户删除清理。

本轮不把 `personal_model_evidence_refs` 绑定 goal/workout，不实现来源更正/删除的 withdrawn 传播、Personal Model API、Weekly Cognitive Review 或客户端历史页。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/onboarding.constants.ts` 与 `onboarding.ts`
  - 新增快照版本、created/updated/migration checkpoint 动作、complete/checkpoint-only 覆盖范围和严格目标修订 Schema。
  - 目标字段抽成共享严格 Schema，建档请求与历史快照继续使用同一枚举、唯一数组和数值边界。
- `infra/postgres/migrations/0040_onboarding_goal_revision_history.sql`
  - 当前目标新增稳定 `goal_id` 和共同 revision；延迟复合外键要求与 profile revision 一致。
  - 新增结构列加完整 JSON 的 `user_goal_revisions`、精确前驱、覆盖继承、快照相等、双侧当前关系和不可变触发器。
  - revision 1 旧账号回填完整 created；revision 大于 1 只回填 `migration_checkpoint + checkpoint_only`。
- `apps/api/src/onboarding/onboarding.service.ts`
  - 在现有乐观锁事务内推进 current goal revision，并从数据库当前行追加严格历史快照。
  - 新账号从完整 revision 1 开始；旧迁移检查点后的更新继承 `checkpoint_only`，前驱缺失时失败关闭。
- `apps/api/src/onboarding/onboarding.integration.spec.ts`
  - 验证 revision 1/2 的稳定 ID、字段快照、动作、前驱和完整覆盖。
  - 验证 stale PUT 不加历史、直接历史改写/删除失败、current/history 不完整事务回滚及账户删除零残留。
- `apps/api/src/privacy/privacy.service.ts` 与集成测试
  - profile 清单现在声明含历史；同步 v4 导出的 current goal 增加 ID、revision 和有序 `revision_history`。
  - 导出历史通过严格 Schema 验证，现有大小、私密字段和净化媒体门禁不变。
- `apps/api/src/database/schema-drift.test.ts`
  - 锁定快照契约枚举、迁移检查点、profile revision 外键、前驱、快照相等、双侧门禁与不可变语义。
- ADR-0181 与身份、Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 保留公开 onboarding revision 的既有共同版本语义。目标即使字段未改变，也为每次成功本人提交保存对应快照，避免计划或 Personal Model 引用的版本没有来源内容。
2. 给目标分配独立稳定 UUID，而不是用账户 ID 冒充领域聚合。当前行保存该 ID，所有历史以 owner + goal + revision 复合身份隔离。
3. PostgreSQL 版本化构造函数生成固定 JSON；表级约束要求结构列与快照逐字义相同，共享 Zod Schema再验证传输表示。
4. 当前行更新只能精确增加一版，history updated 只能引用前一版并继承覆盖范围。created 和 migration checkpoint 是两个互斥起点。
5. current INSERT/UPDATE 与 history INSERT 两侧都延迟到提交核对。应用可以清晰地先写当前、再写历史，但不能留下任一单边状态。
6. 迁移对现有 revision 1 视为完整单点起点；对 revision 大于 1 的账号只记录当前检查点。后续更新永远继承 checkpoint-only，不能因链继续增长而洗掉历史缺口。
7. 历史不可 UPDATE 或直接 DELETE，当前目标也不可直接删除。账户删除通过 owner 级级联清理，避免新增敏感数据成为擦除残留。
8. 公开建档读取仍只返回当前编辑权威。本人便携导出在现有通用 goal JSON 内嵌有序历史，既不新增公开历史路由，也不遗漏用户数据权利。

## 4. 验证证据

- 第一次应用迁移 0040 时，匿名 `snapshot` 列 CHECK 与显式快照相等约束重名；PostgreSQL 整体回滚，history 表不存在且迁移账本 0040 为零。显式约束改名后成功应用 40 份连续迁移。
- 真实既有数据回填得到 2 条 `created + complete` 和 1 条 `migration_checkpoint + checkpoint_only`，current/history 不匹配数为零。
- schema drift 目标测试 28/28 通过；onboarding 共享契约与 schema 目标测试 33/33 通过；onboarding + privacy 目标集成测试 14/14 通过。
- 完整单元测试 102 个文件、598/598 项通过；真实 PostgreSQL 集成测试 24 个文件、143/143 项通过。浏览器基线保持 95 项，本轮没有修改客户端交互或路由，因此未重复运行浏览器套件。
- 全仓 strict typecheck 与生产构建通过；生产依赖审计保持 0 个 critical/high、9 个已登记 moderate。H5 构建只有已登记的 Taro magic comment 与 308 KiB 入口警告，受正式质量预算约束。
- H5 / WeApp 产物质量门禁通过：总字节为 1,206,969 / 1,105,112，H5 入口 315,262、最大异步 JavaScript 149,734，WeApp vendor 19,338、最大页面 JavaScript 56,943，禁用错误标记为零。
- 中文文档政策、Prettier、diff whitespace 与本轮 11 份文档相对链接检查通过；迁移索引精确覆盖 398 份 Markdown，第 090–187 轮共 98 份、ADR-0085–0181 共 97 份，待迁移保持 191 份。
- 最终数据库仍以 0040 为最新迁移；真实既有数据为 2 条 `created + complete`、1 条 `migration_checkpoint + checkpoint_only`，current/history 不匹配为零。目标集成用例还验证测试账号删除后 current/history 均为零。
- `docs/PROJECT_STATUS.md` 已同步并校验到本机 Obsidian：71,708 字节，SHA-256 `786bec542095f0da928e01e38e5d89b92c67e09156ce6ff5812a98d57bc3fed9`。

## 5. 发现的问题与经验

- 不可变历史无法从当前行反向恢复。最安全的迁移不是复制当前值填满缺口，而是保存一个具名检查点，让后续代码可以明确拒绝不存在的早期来源。
- Profile revision 早已被计划当作“完整建档版本”。另起独立 goal revision 会让既有计划证据和 Personal Model claim 失去共同身份，因此历史必须沿同一 revision 推进。
- 稳定聚合 ID 与 revision 是不同维度：前者说明“哪个目标聚合”，后者说明“它的哪个本人提交版本”。只增加 revision 仍不足以形成可安全引用的来源。
- 只约束前驱不能证明当前已经发布，只有 current 与 history 两侧延迟核对才能同时阻止漏写历史和预写未来历史。
- 覆盖范围必须沿更新继承。迁移检查点之后新增十次 revision，也不能把检查点之前的空缺自动升级为完整历史。
- 新增个人历史时，账户删除与便携导出必须同轮覆盖。内部表不是绕开用户数据权利的理由；公开编辑 API 可以保持当前视图，但本人导出必须交付历史。
- 本轮再次遇到匿名列 CHECK 与显式约束自动名称碰撞。对含列级 CHECK 的新表，跨字段约束应直接使用带语义后缀的唯一名称，并保留迁移事务回滚证据。

## 6. 全局状态、项目反思与下一步

onboarding goal 现在终于能作为真实来源聚合存在：新用户的每次目标提交都有不可变版本，旧用户的历史缺口也能被机器识别。它解决了 0039 之后最直接的数据模型阻塞，同时保持现有建档页面、计划 revision 和公开响应兼容，并补齐本人导出与账户删除。

但 evidence projection 仍只保存“模型快照声明引用了什么”，尚未通过外键证明 goal/workout 来源真实属于同一 owner、聚合与 revision，也没有当前资格和 withdrawn 传播。下一轮只完成这组来源关系与更正/删除传播门禁；回顾、API、客户端和 LLM 表达继续拆轮。

## 7. 参考

- [第 186 轮档案](186-personal-model-evidence-projection-core.md)
- [项目状态](../PROJECT_STATUS.md)
- [身份与建档模型](../architecture/IDENTITY_PROFILE_MODEL.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0181](../architecture/decisions/0181-onboarding-goal-revision-history.md)
