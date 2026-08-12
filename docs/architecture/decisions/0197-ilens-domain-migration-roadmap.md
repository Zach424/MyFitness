# ADR-0197：iLens 领域迁移与纵向切片路线

日期：2026-08-12

状态：已接受

## 背景

仓库已经提供多端记录、修订历史、训练/餐食事实、单周计划、隐私生命周期、私有照片和 Personal Model 内核，但原路线长期围绕通用健身记录和认知镜子推进。新的产品目标是 iLens：AI 驱动的长期个人健身数据库与行动闭环，当前垂直聚焦健身房力量训练。`dataModel.md` 描述十一类目标领域；仓库根目录的 `funcTable.md` 原为空，无法回答哪些能力存在、哪些只需重组、哪些必须扩展或新建。

直接按目标 PRD 批量改表、改页和改命名，会同时改变事实语义、历史兼容、隐私边界和交互入口，无法独立验证，也容易把规划中的 Muscle Model、Body Assessment、Performance 与 Plan v2 冒充为已实现功能。另一方面，整仓重写会丢弃已经验证的 owner 隔离、revision、幂等、响应丢失恢复、候选确认和删除/导出资产。

## 决策

1. `dataModel.md` 作为 iLens 目标模型输入；`funcTable.md` 作为目标与实际仓库的能力迁移矩阵；`docs/product/IMPLEMENTED_PRD.md` 继续作为当前已实现行为的唯一产品清单。目标、缺口和事实不得混写。
2. 保留 Taro + React 多端客户端、NestJS 模块化单体、PostgreSQL、共享契约、确定性领域规则和独立 AI worker 边界。不因品牌或领域扩展提前拆微服务，也不批量重命名仓库、包和部署资源。
3. 现有 Training、Nutrition、隐私、媒体候选、修订历史和 Personal Model 持久内核直接复用。首页、训练执行、训练分析、Body Profile 和计划中心属于逐步界面重组；不得为了目标导航复制第二套事实表。
4. Body Metrics 沿现有健康记录生命周期扩展，但先建立版本化指标注册表，固定指标代码、单位、范围、可否派生和隐私分类。Body Assessment 是新聚合：报告只产生逐字段候选，本人确认后才以精确关联写入身体事实。
5. Muscle Model 是多个下游能力的共享基础，采用稳定 ID、层级、身体区域、前后视图和词表版本。动作的 primary/secondary muscle 关联需要来源和修订；肌群状态必须区分本人记录、系统估计和疼痛信号。
6. Performance 是从已完成训练组事实产生的可复算投影。最佳组、最大重量、次数 PR 和 e1RM 固定算法版本、单位、窗口和证据 revision；e1RM 永远标注为估算，不等同于实测 1RM、技术评分或负荷处方。
7. Plan v2 使用长期计划聚合和 `draft/active/paused/replaced/completed/archived` 生命周期。现有 `weekly_plans` 保持兼容读取和历史，不原地重解释旧状态；迁移必须证明旧计划无损、计划与实际分离。
8. Evidence 不先实现一个接收任意 JSON 的中心表。每个新领域共享 owner、来源、`occurredAt`、系统记录时间、revision、确认状态、完整度和精确引用信封，同时由领域表和外键保证资格；AI 输出默认是候选或草案。
9. Personal Model 的当前内核保留，但不在基础事实域缺失时扩张为宽泛用户画像。Body、Performance 和 Plan v2 稳定后，每次只增加一个严格 claim，并验证覆盖门槛、反证、Unknown、lineage、用户校准、导出和删除。
10. 迁移依次执行六阶段：领域基础、核心交互、Body Profile/报告导入、Plan v2、Personal Model 扩展、AI 闭环。每轮只实现一个可独立测试、可回滚、可归档和可提交的纵向切片；产品/数据安全缺陷可以插队，但必须说明阻塞关系。
11. 第 204 轮从 Muscle Model v1 共享契约和版本化词表开始，只固定数据语言与契约测试，不在同轮加入数据库、动作映射或 UI。第 205 轮再单独完成动作肌群关联持久化和 API。

## 影响

- iLens 不再依赖一次大改版才能产生价值；训练日志、营养和隐私功能在迁移中持续可用。
- Muscle Model、Body Assessment、Performance 和 Plan v2 被明确标记为未实现，不会因产品简报或目标页面命名提前获得完成状态。
- 首页人体图和训练分析需要等待统一肌群与 Performance 事实，短期内先投入底层契约和数据质量，而不是视觉表面。
- Personal Model 已有工作成为可复用认知层，不再单独主导近期路线；合法新建档 goal 的精确时间资格缺陷仍以 R-034 保留并隔离修复。
- 每个新增敏感领域都会增加导出、删除、私有媒体和用户理解成本；这些要求进入各切片验收，不留到“上线前统一补”。

## 备选方案

### 直接按照目标 PRD 一次重建数据库和客户端

拒绝。范围跨越十一领域、历史迁移和多个隐私边界，任何失败都难以定位、回滚或证明用户数据不丢失。

### 先做新首页和人体图，再补数据

拒绝。没有稳定 muscle ID、动作关联和状态来源时，人体图只能依赖硬编码或不可追溯估计，会把视觉演示冒充产品事实。

### 建立一个通用 JSON Evidence 表承载所有新领域

拒绝。它会绕过指标单位、肌群词表、报告确认、Performance 算法和 Plan 生命周期的领域约束，也让外键资格、导出和删除难以失败关闭。

### 继续优先扩展 Personal Model

拒绝作为近期主线。当前只有 goal/workout 三个严格 claim；先补 Body、Performance 和 Plan 事实能让后续认识基于更完整、可纠正且可追溯的证据。

## 验证

- 全量审阅目标 `dataModel.md`、空白 `funcTable.md`、现有 18 个客户端页面、共享契约、API 模块、44 个 SQL 迁移、89 个 OpenAPI 操作和当前产品/架构文档。
- `funcTable.md` 对 Profile、Body Metrics、Body Assessment、Body State、Muscle Model/State、Training、Performance、Nutrition、Plan、Evidence 和 Personal Model 给出当前证据、迁移类型、依赖与首个出口。
- 产品路线图记录六阶段用户价值、依赖图和第 204–224 轮可独立退出证据；已完成 Personal Model 专项单独保留为历史能力。
- 产品简报、已实现 PRD、接口、数据库、架构、风险登记册和项目状态互相区分目标与事实；语言、迁移索引、链接、Obsidian 与 Git 门禁由第 203 轮档案记录。

## 关联

- [产品简报](../../product/PRODUCT_BRIEF.md)
- [已实现产品需求文档](../../product/IMPLEMENTED_PRD.md)
- [交付路线图](../../product/ROADMAP.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [架构基线](../ARCHITECTURE.md)
- [第 203 轮档案](../../iterations/203-ilens-domain-migration-roadmap.md)
