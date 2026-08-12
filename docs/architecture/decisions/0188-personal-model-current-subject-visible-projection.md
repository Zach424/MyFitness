# ADR-0188：Personal Model 当前主题最小可见投影

日期：2026-08-12

状态：已接受

## 背景

ADR-0187 建立了按 active owner 与精确 subject 读取唯一未退役 generation 和 current revision 的严格内部信封。该信封包含 owner、直接前代、内部 revision/reference UUID、完整 EvidenceReference、指纹和策略实现字段，适合仓储一致性与审计，但不能原样作为用户响应。若控制器临时删字段或直接返回内部 revision，未来字段扩张可能造成静默泄露，也会把 owner 不存在与 active owner 尚无主题混成相同语义。

本轮需要先固定独立、严格、可测试的候选可见投影和应用错误边界，再开放 HTTP。它必须保留解释当前认识所需的信息，同时避免暴露授权身份、历史导航、内部关联和实现凭据。数据损坏不能为了隐藏身份而被伪装成空结果或授权失败。

## 决策

1. 新增共享 `personal-model-current-subject-view-v1`。顶层只包含严格版本、`subjectKey` 和可空 `current`；active owner 没有该主题时返回 `current:null`，不得附带 owner 或虚构 Unknown claim。
2. 非空 `current` 保留稳定 `itemId`、正整数 `generation`、当前数字 `revision`、kind、claim Schema、严格结构化 claim、来源、状态、反馈状态、terminal、置信等级/限制、证据摘要和必要时间。
3. 证据摘要只暴露 `asOf`、窗口与 qualified/supporting/contradicting/withdrawn 计数。它不暴露 EvidenceReference 正文、原记录引用、reference UUID、证据顺序或证据指纹。
4. 投影明确排除 `ownerUserId`/`userId`、直接前代、内部 revision UUID、feedback event UUID、derivation/evidence fingerprint、决策输入资格和其他策略实现字段。共享 Schema 为严格对象，新增字段不能被静默接受。
5. `subjectKey` 必须与 claim Schema 匹配；terminal 必须与 superseded/invalidated 状态匹配；证据计数、状态、置信、时间和窗口继续受独立跨字段门禁。可见投影不是宽松 DTO。
6. 投影纯函数先解析完整内部信封，再构造并解析可见 Schema。控制器或客户端不得直接从数据库行或内部 revision 各自挑选字段。
7. 新增应用读取服务调用 repository。仅将 `PersonalModelSubjectAuthorityNotFoundError` 映射为统一 `PersonalModelCurrentSubjectUnavailableError`，使 owner 不存在、disabled 与 deletion_pending 在未来外部边界不可枚举。
8. 数据库歧义、残缺连接、Schema 损坏和其他非 authority 错误保持原样失败关闭。服务不得把内部故障伪装成 `current:null` 或 unavailable。
9. 本轮只把 repository 与读取服务接入 Nest 依赖注入，不新增控制器、路由、状态码、缓存头或 OpenAPI 路径。候选可见投影不等于已公开 API。
10. 本轮不开放历史 lineage、证据分页、便携模型导出、Weekly Cognitive Review、客户端状态或建议驱动；`itemId` 仅为后续精确反馈定位保留，不授予跨主题或历史读取权限。

## 影响

- 未来 HTTP 层只有一个经共享 Schema 验证的响应来源，内部字段扩张不会自动进入公开面。
- active owner 的明确空主题与 authority 不可用保持不同产品语义，同时外部身份是否存在不会通过服务错误类型泄露。
- terminal 当前代仍然可见，用户后续可以理解刚失效或被取代的认识；它不会因为终态而被误报为无记录。
- 应用错误映射保持很窄，运维仍能观察真实数据冲突和损坏，而不是收到误导性的 404/空响应。
- 投影保留证据计数与限制以支持解释，但没有原始证据明细；后续证据访问必须另行设计认证、分页、删除和最小化边界。

该视图只表明系统在读取时拥有一项当前派生认识，不证明现实行为完整、claim 正确、用户已同意、结论适合驱动训练或饮食建议，也不构成医疗判断。

## 备选方案

### 控制器直接返回内部信封

拒绝。内部信封包含 owner、前代、完整证据引用和实现指纹，泄露面过大，且未来内部字段变化会无意扩张 API。

### 在控制器中临时删除敏感字段

拒绝。黑名单容易在新增字段时失效，也无法由共享契约和纯函数测试证明完整输出形状。

### 可见视图只返回 claim 文案

拒绝。缺少状态、置信限制、证据计数、适用窗口和时间会把有限观察包装成无上下文结论，也无法表达 terminal 或本人反馈。

### 把所有错误统一成空主题

拒绝。数据歧义和损坏会被掩盖，用户会把服务故障误解为没有认识，运维也失去失败证据。

### 本轮同时开放 HTTP 和客户端

拒绝。认证 guard、严格路径参数、状态码、`private, no-store`、OpenAPI 及客户端五阶段读取权限需要独立验收，不应与字段投影一次扩张。

## 验证

- 共享契约测试证明三个严格 claim 的最小结构可解析，并拒绝 owner、内部 UUID、指纹、主题/claim 错配、terminal 错配和证据计数漂移。
- 纯投影单元测试证明 active 内容与明确空结果，并逐项断言不包含 owner、predecessor、revision/reference UUID、goal ID、指纹或 references。
- 应用服务单元测试证明只映射 authority 错误，repository conflict 保持原样抛出。
- 真实 PostgreSQL 测试覆盖 active 空主题、owner 不存在/deletion_pending、普通当前、终态未退役和 generation+1 后继。
- 完整单元、集成、typecheck、H5/API/admin 与 WeApp 构建、生产依赖、体积、迁移、中文文档、Obsidian 和 Git 差异门禁通过后提交。

## 关联

- [ADR-0187：Personal Model 当前主题严格内部信封](0187-personal-model-current-subject-envelope.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [接口参考](../../api/API_REFERENCE.md)
- [第 194 轮档案](../../iterations/194-personal-model-current-subject-visible-projection.md)
