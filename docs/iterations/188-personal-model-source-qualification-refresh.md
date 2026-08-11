# 第 188 轮：Personal Model 来源资格与撤回刷新协议

日期：2026-08-12

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只完成 Personal Model P2c 的来源权威边界：goal/workout evidence 必须命中同一 owner、稳定聚合与精确不可变 revision；新模型 revision 只能把当前来源标为 eligible；来源更正或删除必须生成不可变 refresh request，下一模型 revision 必须用精确 withdrawn context 解决请求。旧模型历史不可被当前资格反向改写，新增敏感账本必须随账户删除清理。

本轮不实现确定性刷新执行器，不决定新 claim、置信度或状态，不开放 Personal Model API、客户端界面、Weekly Cognitive Review、LLM 调用或模型导出。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0041_personal_model_source_qualification.sql`
  - evidence 关系新增 goal/workout 生成式 subtype 键和 owner + 聚合 + revision 复合外键。
  - 延迟门禁核对来源快照、时间、时区、当前资格与 withdrawn reason，不存在或错配来源失败关闭。
  - 新增不可变 refresh request / resolution 两张账本，来源修订触发器同事务入队，迁移回填已失效 eligible 引用。
  - 新模型 revision 必须解决全部待处理请求；直接改写/删除请求或解决记录失败，账户删除级联清理。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - revision 和 evidence 投影成功写入后，把本次 withdrawn evidence 与精确请求追加成 resolution；任一绑定不成立则整笔事务回滚。
- `packages/contracts/src/personal-model.ts`
  - training availability 条目允许保留同一 goal 聚合的历史 withdrawn context，同时要求非终态只有一个当前 eligible 来源和 claim 对应引用。
- `packages/contracts/src/personal-model.test.ts`
  - 接受同聚合旧 withdrawn + 新 eligible 修订，拒绝跨 goal 聚合混合。
- `apps/api/src/personal-model/personal-model.repository.integration.spec.ts`
  - fixture 改用真实 goal/workout 来源历史；覆盖不存在/错配来源、goal 更正、workout 更正和删除、遗漏撤回、正确解决、不可变账本及账户删除。
- `apps/api/src/database/schema-drift.test.ts`
  - 锁定迁移 0041、生成键、来源外键、请求/解决关系、资格函数、触发器、延迟门禁和不可变语义。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`
  - 导出分页执行计划允许 PostgreSQL 选择迁移新增的 owner + workout + revision 精确唯一索引，原有查询与性能断言保持有效。
- ADR-0182 与 Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 保留统一有序 evidence 投影，以 PostgreSQL generated columns 从严格 JSON 生成 subtype 键，让多态引用获得真实复合外键，不把来源判断留给通用字符串。
2. 把“历史真实性”和“当前资格”分开：旧 revision 继续保留当时 eligible 陈述；只有新 revision 需要满足当前 goal/workout 资格。
3. 来源修订触发器只对当前 item 中仍 eligible 的旧来源入队，并把旧/new revision、原因和受影响 evidence 固定下来；唯一键把并发或重放收敛为一次请求。
4. 请求不用可变 status。新 revision 中对应 withdrawn evidence 与独立 resolution 共同证明处理结果，历史状态不会因后来更新被覆盖。
5. 仓储只在 revision/evidence 已通过共享契约后追加 resolution。数据库延迟门禁在提交时复核请求、item、新 revision、旧来源和 withdrawn reason，防止应用旁路或伪解决。
6. goal 更正使用同一稳定 goal ID 的下一 revision；workout 更正与删除分别绑定新 revision 和 deletion 状态。来源删除不会物理抹除历史，因此旧 evidence 仍可审计。
7. 训练可用性契约以稳定聚合为边界：旧版本可作为 withdrawn context 留存，新 claim 必须对应唯一当前 eligible 版本，不能把另一个 goal 的来源拼入修订。
8. 迁移先验证既有引用的来源事实，再回填当前已失效引用的请求。无法证明的引用不会被自动修复或伪造来源。

本轮始终把“来源曾被引用”“来源现在仍合格”和“来源变化已经处理”作为三件不同的事。第一项属于不可变历史，第二项属于新修订的提交资格，第三项属于请求与解决账本。分层后既能保留过去的完整解释，也能阻止过期材料继续驱动未来建议；任一层缺少证据都明确失败，不以最新状态覆盖过去，也不以历史存在冒充当前有效。

## 4. 验证证据

- 第一次应用迁移 0041 时，匿名 `reason` 列 CHECK 与显式跨字段约束重名；PostgreSQL 整体回滚，request 表不存在且迁移账本 0041 为零。显式约束改用唯一语义名称后成功应用 41 份连续迁移。
- Personal Model 共享契约与 schema drift 定向测试 52/52 通过；真实仓储集成测试 14/14 通过；Personal Model + onboarding + workouts 相邻集成测试 21/21 通过。
- 真实 PostgreSQL 已证明 goal/workout 精确来源绑定、错来源失败、三类来源变化入队、遗漏撤回回滚、withdrawn + resolution 原子提交、账本不可变和账户删除零残留。
- 第一次全量集成有 144/145 项通过：PostgreSQL 正确改选迁移 0041 新增的精确 workout revision 索引，但导出性能测试只接受两个旧索引名称。扩展断言后，定向导出测试 53/53、第二次完整集成 24 个文件 145/145 项通过。
- 完整单元测试 102 个文件、600/600 项通过；全仓 strict typecheck 与生产构建通过。生产依赖审计保持 0 个 critical/high、9 个已登记 moderate；H5 只有既有 Taro magic comment 与 308 KiB 入口警告。
- H5 / WeApp 产物质量门禁通过：总字节为 1,206,969 / 1,105,112，H5 入口 315,262、最大异步 JavaScript 149,734，WeApp vendor 19,338、最大页面 JavaScript 56,943，禁用错误标记为零。浏览器基线保持 95 项，本轮没有修改客户端交互或路由，因此未重复运行浏览器套件。
- 中文文档政策、Prettier、diff whitespace 与迁移索引通过；当前共 400 份 Markdown，第 090–188 轮共 99 份、ADR-0085–0182 共 98 份，待迁移保持 191 份。
- 最终数据库仍以 0041 为最新的 41 份迁移；既有 goal 历史为 2 条 `created + complete`、1 条 `migration_checkpoint + checkpoint_only`，current/history 不匹配为零。集成清理后 Personal Model item、revision、evidence、request 和 resolution 均为零。
- `docs/PROJECT_STATUS.md` 已同步并校验到本机 Obsidian：71,900 字节，SHA-256 `700c57b7ee920c0467a19fe6e78ad06c0c77bc5d26931bc25dd1d0f0e1fd3228`。

## 5. 发现的问题与经验

- 多态 evidence 不一定要退化成无外键 JSON，也不一定立即拆成多张表。严格 discriminator 配合生成式 subtype 键，可以同时保留统一顺序和数据库引用完整性。
- 旧模型的 eligible 是当时发布事实，不能因为来源今天失效就原地改成 withdrawn。当前资格必须约束新写入，撤回传播则由新 revision 表达。
- 可变队列 status 只能说明“现在看起来完成”，不能证明“由哪一版模型、哪条 evidence 完成”。不可变 request + resolution 使刷新链可以独立审计。
- 来源撤回后的新 revision 必须能同时保留旧 withdrawn context 与新 eligible 来源，因此 training availability 的旧单引用假设要收敛为“同稳定聚合、唯一当前来源”。
- refresh trigger 只负责记录必须处理的事实，不应在数据库内推导新 claim。否则来源事务会混入产品推断和安全策略，难以验证也难以回滚。
- 本轮再次遇到匿名列 CHECK 与显式约束名称碰撞。迁移事务完整回滚证明了失败关闭；后续新表的跨字段约束继续使用带关系语义的唯一名称。
- 延迟约束使来源写入、请求入队、模型修订和 resolution 可以按清晰顺序写入，但最终仍在提交边界统一核对，避免中间状态成为持久事实。
- 新索引可能改变数据库优化器的合法选择，即使查询语义和性能方向都没有退化。执行计划测试应约束“使用满足查询前缀的受认可索引”，并随迁移同步登记新索引；不能把旧名称列表误当成唯一正确计划。发现这种失败时仍要先核对实际条件、排序和扫描方向，再扩展断言，不能为了让测试变绿而无条件接受任意索引。

## 6. 全局状态、项目反思与下一步

Personal Model evidence 现在不再只是“快照自称引用了某个来源”：数据库能证明 goal/workout 属于本人并命中精确不可变版本；来源变化也不能静默留下仍 eligible 的新模型，必须经过有旧 context 的撤回修订和不可变解决记录。这完成了 P2c 的关系权威与传播协议，同时保留旧模型的历史语义。

但请求账本不会自行决定训练可用性的新值，更不证明模型内容正确。下一轮只实现确定性 `training_availability_constraint_v1` 派生器与 refresh executor：消费一项待处理请求，用共享契约和安全门禁形成最小模型修订；API、客户端、回顾、LLM 和真实外部接入继续后置。

## 7. 参考

- [第 187 轮档案](187-onboarding-goal-revision-history.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0182](../architecture/decisions/0182-personal-model-source-qualification-refresh.md)
