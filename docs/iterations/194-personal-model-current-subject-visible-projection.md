# 第 194 轮：Personal Model 当前主题最小可见投影

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只完成 P4 的公开读取前置：从严格内部当前主题信封生成一个独立、严格、owner-free 的候选可见视图。视图必须保留解释当前 claim 所需的状态、反馈、置信限制、证据摘要、时间和稳定定位，同时移除 owner、历史前代、内部 revision/reference UUID、EvidenceReference 正文、指纹及策略字段。active owner 没有主题要返回明确空视图；owner 不存在或非 active 要统一成不可枚举应用错误；数据歧义或损坏不能被隐藏。

本轮不新增迁移、控制器、HTTP 路由、状态码、缓存头、OpenAPI 路径、lineage/证据分页、客户端、Weekly Cognitive Review、Personal Model 导出、自动调度、LLM 或云资源。候选可见投影尚不能被描述为用户已可访问功能。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model.constants.ts`
  - 新增 `personal-model-current-subject-view-v1` 版本字面量。
- `packages/contracts/src/personal-model.ts`
  - 新增严格当前主题可见视图、可见 item、置信和证据摘要 Schema 及 TypeScript 类型。
  - 锁定 subject/claim、terminal/status、状态置信、证据计数、窗口与时间的一致性。
- `packages/contracts/src/personal-model.test.ts`
  - 新增可见结构与拒绝矩阵测试，证明未知/内部字段和跨字段漂移失败。
- `apps/api/src/personal-model/personal-model-current-subject-view.ts`
  - 新增内部信封到可见视图的纯投影器，以及应用读取服务与统一 unavailable 错误。
- `apps/api/src/personal-model/personal-model-current-subject-view.test.ts`
  - 证明正常/空投影、敏感字段排除、authority 错误映射与数据 conflict 透传。
- `apps/api/src/personal-model/personal-model-current-subject.integration.spec.ts`
  - 增加真实 PostgreSQL 可见投影测试，覆盖空主题、不可枚举 authority、普通当前、终态当前与后继代。
- `apps/api/src/app.module.ts`
  - 将 repository 与当前主题视图服务接入 Nest 依赖注入，但不注册控制器。
- ADR-0188、Personal Model、架构、数据库、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 可见投影以严格白名单 Schema 独立定义，不对内部 revision 使用删字段黑名单。未来内部字段增长不会自动成为公开字段。
2. 投影器首先解析 `personal-model-current-subject-envelope-v1`，因此只能处理 repository 已验证的唯一当前代；然后构造并再次解析 `personal-model-current-subject-view-v1`。
3. 空主题只返回版本、subject 和 `current:null`，不回显 owner，也不虚构 Unknown 或零行为。
4. 非空视图保留稳定 item ID、generation 和数字 revision，为后续精确反馈提供定位；内部 revision UUID、直接前代和 evidence reference UUID 不进入视图。
5. claim 保持严格结构化联合，不降级为自由文本。subject 与 claim Schema 必须精确对应，防止调用方把一类训练认识标成另一主题。
6. confidence 只保留 level 与 limitations；证据计数集中在 evidence 摘要，避免历史置信收据与当前撤回计数出现两个看似同义的数字来源。
7. evidence 摘要保留 as-of、窗口和 qualified/supporting/contradicting/withdrawn 计数，既允许展示依据边界，又不泄露具体记录引用、顺序、正文或指纹。
8. terminal 由当前状态严格绑定；invalidated/superseded 当前代仍可显示，只有后继创建后旧代才不再被 current-subject 查询选中。
9. 应用服务只捕获 repository 的专用 authority 错误，将不存在、disabled 与 deletion_pending owner 统一为 unavailable。其他错误原样抛出，避免把数据库冲突、残缺或 Schema 损坏伪装成无权限或无主题。
10. 服务进入依赖注入是下一轮控制器的最小前置，不会自行创建路由、缓存语义或 OpenAPI 承诺。

## 4. 验证证据

- 定向共享契约与视图服务测试：2 个文件、32 项通过。
- 定向真实 PostgreSQL 测试：1 个文件、6 项通过。
- 完整单元测试：107 个文件、645 项通过。
- 完整 PostgreSQL 集成测试：28 个文件、168 项通过。
- 工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过入库预算且与上一轮相同。
- 浏览器和 OpenAPI 未改变，沿用 95 项浏览器基线；本轮不据此声称存在 Personal Model HTTP 路由或客户端页面。
- 数据库已应用并核验 44 个迁移；本轮没有迁移，集成清理后 item/revision/evidence/request/resolution 五类 Personal Model 表均为 0。
- 中文文档与迁移索引通过：`docs/` 共 412 份 Markdown，第 090–194 轮 105 份档案与 ADR-0085–0188 104 份决策连续受保护，待迁移总量仍为 191。
- Obsidian 状态镜像在提交前完成逐字节同步与校验，仓库 `docs/PROJECT_STATUS.md` 继续是权威副本。
- 格式与 Git 差异检查在提交前再次完成。

## 5. 发现的问题与经验

- “可见”应是独立白名单结构，不是内部对象删几项字段。黑名单无法防止未来新增敏感字段被默认为公开。
- 授权隐藏和数据错误隐藏不是同一件事。owner 是否存在可以统一外部语义，数据库歧义或损坏却必须保持失败，才能被测试和运维发现。
- 空主题不是 Unknown claim。前者表示尚无条目，后者表示系统曾运行派生但证据不足；将两者合并会制造不存在的认知历史。
- terminal 也不是空主题。失效或被取代的当前代仍承载解释和纠正上下文，直到严格后继原子接续。
- evidence count 应有一个公开权威位置。把 qualified count 同时放在 confidence 和 evidence 中会在撤回或历史修订场景造成语义漂移，因此可见层只在 evidence 摘要保留该计数。
- item ID 可以支持下一轮精确反馈目标，但 revision/reference UUID、前代和证据正文属于更高权限的审计面，不能因为“以后可能用到”而提前暴露。
- 将服务注册到 Nest 并不等于开放 API。认证、严格路径参数、不可枚举状态码、`private, no-store` 和 OpenAPI 需要下一轮独立证据。

## 6. 全局状态、项目反思与下一步

Personal Model 的三个首批 claim 现在形成“确定性派生 → 不可变 revision/代际 → 单语句当前选择 → 最小可见投影”的内部链路。可见字段与内部审计字段已由严格共享 Schema 分离，active 空主题、authority 不可用、终态当前和数据损坏也拥有不同语义，为安全公开一个极小读取面提供了前置条件。

下一轮只开放一个已认证的当前主题只读 HTTP 路由：subject 使用严格枚举，响应只允许 `personal-model-current-subject-view-v1`，设置 `private, no-store`，空主题保持 200 + `current:null`，authority 使用不可枚举错误，数据错误保持服务失败；同时生成并锁定 OpenAPI 与 API 集成测试。

lineage/证据分页、反馈 UI、Weekly Cognitive Review、Personal Model 便携导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。候选可见视图仍是有限记录的派生摘要，不是完整个人真相，也不能自动驱动训练、饮食或医疗建议。

## 7. 参考

- [第 193 轮档案](193-personal-model-current-subject-envelope.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0188](../architecture/decisions/0188-personal-model-current-subject-visible-projection.md)
