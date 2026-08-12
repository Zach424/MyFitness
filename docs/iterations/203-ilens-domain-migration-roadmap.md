# 第 203 轮：iLens 领域迁移路线

日期：2026-08-12

分类：A（Architecture）

状态：已完成

## 1. 范围与验收标准

本轮只完整审阅 `dataModel.md`、`funcTable.md` 和实际仓库，形成 iLens 从当前实现到目标模型的领域迁移 Roadmap。必须逐项说明可直接复用、只需界面重组、必须模型扩展和完全新建的能力，给出依赖顺序、每阶段用户价值与可验证出口，并保持已实现 PRD 只描述真实能力。

本轮不新建业务表、接口或页面，不接真实 AI/云资源，也不把目标文档命名为完成功能。此前发现的 Personal Model goal 微秒精度资格修复作为隔离工作保留，不混入本轮产品架构变更。

## 2. 项目结构、设计、技术与实现内容

- 根目录 `dataModel.md`
  - 作为用户提供的 iLens 目标数据模型原文入库，覆盖 Profile、Body、Muscle、Training、Performance、Nutrition、Plan、Evidence 和 Personal Model。
- 根目录 `funcTable.md`
  - 从空文件补成能力迁移矩阵，记录当前代码证据、可复用资产、主要缺口、迁移类型、依赖、页面映射和首个验收。
- `docs/product/ROADMAP.md`
  - 把近期主线重排为 Phase 0–6，并给出第 204–224 轮独立纵向切片；第 0–202 轮历史保持不变，Personal Model 已完成专项保留为可复用层。
- `docs/product/PRODUCT_BRIEF.md`
  - 产品方向更新为 iLens 长期健身数据库与行动闭环，当前力量训练垂直；目标信息架构和新用户任务明确标为目标而非现状。
- `docs/product/IMPLEMENTED_PRD.md`、接口与数据库文档
  - 刷新当前 69 个 OpenAPI 路径、89 个操作、44 个迁移和 46 张迁移定义表；明确 Muscle Model、Body Assessment、Performance 与 Plan v2 未实现。
- ADR-0197 与架构基线
  - 固定不整仓重写、Evidence 不建万能 JSON 表、旧 weekly plan 兼容和 Personal Model 后置扩张的决策。
- 风险登记册
  - 新增肌群词表漂移、体测报告误写和 e1RM/PR 误读三项风险，并同步语言门禁库存。

## 3. 实现方法

1. 从目标模型提取十一类领域，再反向检查共享契约、44 个 SQL 迁移、API 模块和 18 个客户端页面，避免以页面名称推断后端能力。
2. 将每项能力归入直接复用、界面重组、模型扩展或新建领域；Training、Nutrition、隐私和 Personal Model 内核优先复用，Muscle Model、Body Assessment、Performance 与 Plan v2 明确新建。
3. 依赖图从稳定事实语言出发：Muscle Model 支撑动作关联、肌群状态和人体图；指标注册表支撑报告确认；训练事实支撑 Performance；这些再共同支撑 Plan v2、Personal Model 与 AI 闭环。
4. 以可独立验证的编号迭代替代“大版本全部完成”：首轮 204 只固定 Muscle Model v1 契约与词表，后续持久化、界面和 AI 分开验收。
5. 对所有目标文档使用“目标/待实现”措辞，同时在已实现 PRD、API 和数据库文档留下明确负面能力清单，防止规划污染当前事实。
6. 数据安全横贯每个阶段：AI 提取只产生 candidate，e1RM 标为估算，Unknown 不等于零，新域同步接入 owner、revision、导出、纠正和删除。

## 4. 验证证据

- 目标模型章节完整覆盖 39 个主题；`funcTable.md` 从空文件形成领域、页面、工程资产、跨域规则和依赖主链五类审计结果。
- 仓库实测为 69 个 OpenAPI 路径、89 个 HTTP 操作、44 个 SQL 迁移和 46 张迁移文件定义表；相应现状文档已同步。
- Roadmap 包含 Phase 0–6 的用户价值、依赖和退出门禁，以及第 204–224 轮的单一切片范围。
- 本轮不修改业务代码、Schema 或运行时行为，因此沿用第 202 轮已通过的 775 项单元、176 项 PostgreSQL 集成和双端产物基线；文档与治理命令在提交前重新执行。
- 中文、迁移索引、链接、格式、Git 差异及 Obsidian 逐字节同步在提交前完成。

## 5. 发现的问题与经验

- `funcTable.md` 起始为 0 字节，不能把空文件当作已有差距分析；用实际代码证据重建并明确标注审计时间更可靠。
- 当前动作洞察有训练量和点序列，但没有最大重量、最佳组、e1RM 或 PR 语义；“有统计”不能等同于 Performance 领域完成。
- 当前全身恢复估计和全局酸痛不能替代肌群状态。若没有统一 muscle ID，人体 SVG、动作分析和计划会形成多套不可兼容词表。
- 食物照片候选流能复用媒体与确认模式，但 Body Assessment 内容、批量写入和报告保留是新领域，不能复制 nutrition Schema。
- 当前 weekly plan 的单周生成/接受语义与长期 Plan 生命周期不同。兼容新建比原地扩枚举更能保护既有历史。
- Personal Model 的严格证据/反馈内核有价值，但在身体、表现和计划事实缺失时继续扩 claim 会放大记录偏差；近期应先补事实地基。

## 6. 全局状态、项目反思与下一步

iLens 现在有一条不会把目标冒充事实的迁移路径：当前成熟能力继续服务用户，四个新领域按依赖逐项进入，核心页面和 AI 在底层事实稳定后重组。产品重心从“继续堆页面或 claim”转向“统一、可追溯、可复算的数据语言”，这会延后视觉大改，但能避免后续人体图、训练分析和计划各自形成不同事实。

下一轮执行第 204 轮 Muscle Model v1 共享契约与版本化词表：固定稳定 ID、层级、身体区域、前后视图、名称和版本，只做契约/领域测试，不加入数据库、动作映射或 UI。R-034 的精确时间资格修复继续作为独立 WIP 保存；若它阻塞第 204 轮验证再单独恢复，否则在合适的修复轮完成。

## 7. 参考

- [第 202 轮档案](202-personal-model-feedback-calibration-surface.md)
- [项目状态](../PROJECT_STATUS.md)
- [产品简报](../product/PRODUCT_BRIEF.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0197](../architecture/decisions/0197-ilens-domain-migration-roadmap.md)
