# 第 193 轮：Personal Model 当前主题严格内部信封

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只实现 P4 前置的最小内部当前主题读取。共享信封必须按 owner/subject 表达唯一未退役 generation，绑定直接前代、当前精确 revision、终态与退役元数据；active owner 没有该主题时返回明确空结果。数据库读取必须使用一条语句，不能由调用方先列出 item 再猜 ID；owner 缺失/停用、非法 subject、跨 owner、重复当前代或残缺连接必须失败关闭。

本轮不新增迁移、控制器、OpenAPI、客户端、完整 lineage、证据分页、Weekly Cognitive Review、模型导出、自动调度、LLM 或云资源。内部信封含完整敏感 revision，不能据此声称存在用户可见 Personal Model。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model.constants.ts`
  - 新增 `personal-model-current-subject-envelope-v1` 版本字面量。
- `packages/contracts/src/personal-model.ts`
  - 新增严格当前主题信封、当前 generation 结构及 `PersonalModelSubjectKey` 类型。
  - 锁定 owner、subject、item、generation/前代、terminal、retired 与完整 revision 的跨字段一致性。
- `packages/contracts/src/personal-model.test.ts`
  - 新增三项契约用例，覆盖正常/拒绝矩阵、终态但未退役和明确空主题。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增 `getCurrentSubject(userId,subjectKey)` 和专用 authority 错误。
  - 使用单条 active-owner 左连接查询取得唯一未退役 item 与 current revision；对歧义、残缺和跨 owner 结果二次失败关闭。
- `apps/api/src/personal-model/personal-model-current-subject.test.ts`
  - 模拟两条数据库结果，证明 repository 不会以第一行掩盖当前代歧义。
- `apps/api/src/personal-model/personal-model-current-subject.integration.spec.ts`
  - 新增四项真实 PostgreSQL 测试，覆盖空主题、authority/输入、双 owner/subject 隔离、终态当前与后继选择。
- ADR-0187、Personal Model、架构、数据库、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 方法先用空信封解析输入，因此 user UUID 和 subject 枚举在数据库访问前受同一共享契约约束。
2. SQL 从 `users` 读取 active authority，再以 owner + subject + `retired_at IS NULL` 左连接 item；第二个左连接只允许该 item 的 `current_revision` 精确行。
3. active owner 没有 item 时语句仍返回一行，repository 检查所有代际/revision 列均为空后返回 `current:null`；owner 不存在或非 active 时零行并抛专用错误。
4. 正常数据库由部分唯一索引保证至多一个当前代；repository 仍要求结果行数严格为一，模拟重复结果时抛 conflict，避免未来查询或约束漂移后任取第一条。
5. 非空行必须拥有 generation、revision 身份、Schema 版本、快照、指纹和变更时间，且 `retired_at` 必须为空；缺一项即视为损坏，不生成部分信封。
6. 复用既有 `mapRevisionRow()` 完整解析 snapshot/revision 与时间一致性，再由新信封 Schema 核对 owner、subject、item 和代际形状。
7. terminal 只从 revision 当前状态是否为 `superseded`/`invalidated` 推导；`retiredAt` 在当前信封中固定 null。终态可以仍是当前代，只有原子后继创建后旧代才退出信封。
8. 第一代必须无前代，后续代必须有且不能指向自身；当前信封只返回直接前代 ID，不递归加载 lineage。
9. 查询为一个 PostgreSQL 语句快照，不在 item/revision 间产生应用层二次读取窗口。本轮不加事务锁，因为它是只读快照，不承担刷新或换代写入。

## 4. 验证证据

- 定向共享契约与歧义测试：2 个文件、27 项通过。
- 定向真实 PostgreSQL 测试：1 个文件、4 项通过。
- 完整单元测试：106 个文件、639 项通过。
- 完整 PostgreSQL 集成测试：28 个文件、166 项通过。
- 工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 浏览器和 OpenAPI 未改变，沿用 95 项浏览器基线；本轮不据此声称存在用户可见 Personal Model 页面或路由。
- 数据库已应用并核验 44 个迁移；本轮没有迁移，集成清理后 item/revision/evidence/request/resolution 五类 Personal Model 表均为 0。
- 中文文档与迁移索引通过：`docs/` 共 410 份 Markdown，第 090–193 轮 104 份档案与 ADR-0085–0187 103 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像在提交前完成逐字节同步与校验，仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 格式与 Git 差异检查在提交前再次完成。

## 5. 发现的问题与经验

- “终态”与“已退役”不是同一个状态。一个 invalidated item 可以在没有新合格证据时继续是当前代；若读取层把 terminal 过滤掉，会让用户无法解释刚刚失效的结论。
- 数据库唯一索引不是读取错误策略。查询仍应检查返回行数并拒绝歧义，否则约束漂移、恢复损坏或未来 join 扩张可能被 `rows[0]` 静默掩盖。
- 空主题应由存在的 owner 行通过左连接表达，不能把“owner 不存在”和“这个 owner 尚无该主题”都压成空数组；两者的授权与产品含义不同。
- 当前 generation 与 current revision 必须在同一语句快照中取得。先找 item 再读 revision 会增加换代或指针推进后的撕裂组合风险。
- 内部完整信封不等于公开响应。完整 revision 含敏感证据引用和实现元数据，下一层必须独立定义最小可见字段、授权错误隐藏和缓存行为。
- 代际前代只能作为直接导航提示；未设计分页前不能递归加载整条 lineage，也不能把 revision 游标误作 generation 游标。

## 6. 全局状态、项目反思与下一步

三个严格 claim 现在不仅能确定性创建、刷新、失效和换代，也有一个不依赖调用方猜 item ID 的当前主题读取原语。它在数据库和共享 Schema 两层同时绑定 owner、subject、唯一未退役代、代际元数据和精确 revision，为后续用户可见投影、回顾选择器和公开授权提供一致入口。

下一轮只设计当前主题的用户可见只读投影与授权错误边界：从内部信封最小化为状态、时间、限制与明确空结果，禁止泄露其他 owner、历史代、内部指纹或不必要证据正文。先不一次完成控制器、lineage/证据分页或客户端；公开路由必须在投影与错误语义独立验证后再开放。

Weekly Cognitive Review、Personal Model 便携导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。数据库中的唯一当前代仍只是可审计的当前派生结论，不是用户完整、永久或被本人确认的真实画像。

## 7. 参考

- [第 192 轮档案](192-recorded-session-duration-deterministic-deriver.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0187](../architecture/decisions/0187-personal-model-current-subject-envelope.md)
