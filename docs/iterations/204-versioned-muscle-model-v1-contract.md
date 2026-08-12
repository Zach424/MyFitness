# 第 204 轮：版本化 Muscle Model v1 共享契约

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只为全产品建立一个可复用、版本化、严格受检的 Muscle Model v1 数据语言。必须固定稳定 muscle ID、一级区域、唯一层级、中文名、前/后身体视图、区域内顺序和 aggregate 边界；同版本漂移、别名式 ID、重复视图和未知字段必须失败关闭。

本轮不增加数据库迁移、HTTP、动作 primary/secondary 映射、训练量权重、肌群状态、人体 SVG 或客户端页面。完成契约不能描述为用户已经获得肌群功能。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/muscle-model.constants.ts`
  - 提供无 Zod 的只读 `ilens-muscle-model-v1` 常量、5 个 region、26 个 muscle、节点类型、身体视图和完整 catalog。
- `packages/contracts/src/muscle-model.ts`
  - 提供严格 Zod Schema、单项规范语义、完整 catalog 漂移检查和推导 TypeScript 类型；只有 `core_global` 可为 aggregate。
- `packages/contracts/src/muscle-model.test.ts`
  - 覆盖身份、层级、连续顺序、视图、aggregate 和同版本失败关闭。
- `packages/contracts/package.json`
  - 新增 `./muscle-model` 与 `./muscle-model.constants` 明确子路径；根导出不装载词表，保护尚未接入功能的客户端入口。
- ADR-0198、架构基线、已实现 PRD、接口参考、路线图、风险、迁移矩阵与项目状态同步更新。

## 3. 实现方法

1. 把目标模型中的 5 个一级区域转为稳定小写 snake_case 身份，并把 26 个细分项逐一分配到唯一 region。
2. 中文名与 ID 分离；下游只能保存 ID 和词表版本，不能保存中文标签作为关系身份。
3. 定义 `front|back` 只是未来视觉可展示面；SVG path、坐标、医学边界和疼痛区域不进入领域契约。
4. 将“核心整体”明确建模为唯一 aggregate，其余 25 项为 muscle group，避免汇总概念参与具体动作或测量语义。
5. 单项 Schema 本身也核对 v1 规范定义，不只依赖完整 catalog；不可信单个 muscle 对象不能借合法 ID 搭配错误 region、名称或视图通过。
6. 完整 catalog 进一步锁定数量与规范顺序。同版本任何语义修改都必须失败；未来变化发布新版本并显式迁移。
7. 常量和运行时 Schema 使用独立子路径，允许未来客户端只取无 Zod 常量；本轮不从包根导出，避免未接 UI 的能力进入当前浏览器 bundle。

## 4. 验证证据

- 定向契约测试：1 个文件、7 项通过。
- `@myfitness/contracts` strict typecheck 与 build 通过。
- 完整单元测试：121 个文件、782 项通过；比第 203 轮增加 1 个文件、7 项。
- 全工作区 strict typecheck 通过。
- 本轮未改变 SQL、OpenAPI、API 控制器或客户端，因此不新增 PostgreSQL 集成和浏览器行为声明；既有 176 项集成及双端产物数字仍是上一轮基线，不冒充本轮重跑结果。
- 中文、迁移索引、格式、Git 差异和 Obsidian 门禁在提交前完成。

## 5. 发现的问题与经验

- 只在完整 catalog 入口校验规范字段不够；下游以后可能单独解析一个 muscle，因此单项 Schema 也必须阻止合法 ID 与错误 region、名称或视图的组合。
- “核心整体”来自产品目标，但不是单块肌肉。用 aggregate 显式区分，能防止它与腹直肌、腹斜肌在训练量或人体图中被等价累加。
- 前/后视图和 SVG path 属于不同层次。前者是领域可见面，后者是可替换的视觉资产；混在一个版本会让视觉微调污染历史业务语义。
- 公共包根导出会影响所有消费者的模块图。对尚未接入 UI 的大常量和 Zod Schema 使用明确子路径，更符合当前包体预算约束。
- 词表“改名”可能改变历史解释。版本号必须保护中文名、层级和视图，而不只是 ID 数组。

## 6. 全局状态、项目反思与下一步

iLens 现在第一次拥有跨领域唯一的 muscle 身份语言，但它仍只是契约基础。Training、Plan、Body State、Performance、人体图和 AI 还没有消费它；真正的用户价值要从动作关联开始形成。

下一轮执行第 205 轮动作与肌群关联持久化/API：为 starter 与 custom 动作定义 primary/secondary muscle ID、关联来源与词表版本，保留修订历史和 owner 边界，并让动作目录 API 返回严格关系。不得在同轮加入肌群训练量、人体图或计划算法。

## 7. 参考

- [第 203 轮档案](203-ilens-domain-migration-roadmap.md)
- [项目状态](../PROJECT_STATUS.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考](../api/API_REFERENCE.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0198](../architecture/decisions/0198-versioned-muscle-model-v1-contract.md)
