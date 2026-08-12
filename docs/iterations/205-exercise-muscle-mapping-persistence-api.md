# 第 205 轮：动作肌群关系持久化与 API

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只完成 Muscle Model 的首个消费切片：starter/custom 动作返回有版本、有来源、可修订的 primary/secondary 肌群；owner 数据必须保留隔离、历史、导出、清除与账户删除语义；新训练必须保存选择时关系快照，目录后续变化不得改写旧训练。

旧客户端不传关系必须继续工作；未配置必须显式 Unknown。`core_global`、重复、主次交叉、未知 ID、错误版本、未知字段和直接数据库旁路必须失败关闭。本轮不加入映射编辑 UI、肌群训练量、人体 SVG、肌群状态、动作技术判断或计划算法。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts`
  - 区分 25 个可映射 muscle group 与唯一 aggregate，新增严格 mapped/unmapped 关系、写入 Schema、来源枚举和训练选择时快照。
  - starter 目录升级为 `starter-2026-08-12-v2`；8 个具体动作映射，`mobility_flow` 保持 unmapped。
- `infra/postgres/migrations/0045_*` 与 `0046_*`
  - 自定义目录新增版本、来源及主/次数组，数据库重复白名单、唯一、交叉和原子形状约束。
  - 训练动作新增 `muscle_mapping jsonb` 历史快照列；因 `0045` 已在本地执行，快照列独立使用前向 `0046`。
- `apps/api/src/exercise-catalog`
  - starter/custom 响应返回严格关系；custom 创建、更新、省略保留、显式清除、revision、幂等与 owner 语义进入同一事务。
- `apps/api/src/workouts` 与隐私导出
  - 训练保存/读取选择时关系，完整 workout revision 自然保留；同步和异步便携导出都输出该字段。
- `apps/client/src/pages/workouts`
  - 目录选择深拷贝映射，敏感草稿守卫复用共享版本/来源/ID 常量，保存、重复和更正保留快照。
- `docs/api/openapi.json`、ADR-0199、架构/数据库/产品/风险/路线图/迁移矩阵与项目状态同步更新。

## 3. 实现方法

1. 先把 `core_global` 从可映射 ID 集合中分离，避免 aggregate 因属于总词表而误入动作关系。
2. 使用判别联合表达 mapped/unmapped，不用可空字段的任意组合；API 输出始终显式 Unknown。
3. starter 关系随目录版本发布；owner 关系进入当前行与完整 revision，不建立第二张可变关系权威表。
4. 更新语义区分 `undefined` 与 `null`：旧客户端省略字段保持现有关系，本人显式清除才写 unmapped。
5. 训练复制选择时完整关系而不是只保存 `exerciseKey`，防止目录更正静默改变历史解释；导出查询同时增加关系字段。
6. 契约与 PostgreSQL 双重约束自定义当前行；训练 JSON 由写入/响应共享 Schema 和不可变 revision 保护，当前不参与派生计算。
7. 当已执行 `0045` 后发现训练快照也属于历史正确性时，不修改既有 SQL，而新增 `0046`。全量迁移 checksum 门禁验证前向纪律。
8. 客户端只加载无 Zod 常量子路径，并重跑双端生产构建与入库预算，量化新共享语言的实际成本。

## 4. 验证证据

- 定向单元：7 个文件、110 项通过。
- 定向 PostgreSQL：2 个文件、5 项通过。
- 完整单元：121 个文件、786 项通过，比第 204 轮增加 4 项。
- 完整 PostgreSQL 集成：29 个文件、177 项通过，比上一基线增加 1 项；首次运行发现并修复导出字段断言与既有查询计划测试的 planner 选择不稳定。
- 全工作区 strict typecheck 通过；OpenAPI 重新生成，仍为 69 个路径、89 个操作。
- H5/WeApp 生产构建通过。客户端质量门禁：H5 总量/入口/最大异步块为 1,278,689/315,457/150,085 字节；WeApp 总量/vendor/最大页面为 1,087,098/19,338/48,416 字节，全部低于原预算。
- 格式、中文、迁移索引、Git 差异和 Obsidian 门禁在提交前完成。

## 5. 发现的问题与经验

- 只保存动作 key 不足以保护历史解释；显示名、器械和 tracking mode 已经是快照，肌群关系也必须采用同一历史语义。
- `undefined` 与 `null` 对兼容更新含义不同。把两者都当清除会让旧客户端无意丢失新字段；更新输入必须显式区分保留与删除。
- aggregate 属于完整 Muscle Model，但不属于动作可映射集合。白名单应直接来自类型/常量分层，而不是在每个调用点临时排除。
- 迁移一旦执行就不可继续编辑，即使尚未提交。checksum 漂移测试及时发现这一点；新增前向迁移比清理本地账本更接近生产纪律。
- PostgreSQL 在同时存在降序前缀索引和完整升序索引时，可能选择“旧索引 + incremental sort”。查询计划测试若只想证明完整索引可执行，需要同时关闭普通与 incremental sort，不能把成本选择误报成索引缺失。
- 关系来源不是内容资格。`starter_catalog` 和 `user_confirmed` 只回答从哪里来，不回答动作刺激比例、技术质量、安全性或个体适配；后续聚合前仍要独立审阅。

## 6. 全局状态、项目反思与下一步

iLens 的 Muscle Model 现在从“只有词表”推进到“动作目录和训练历史真正引用同一身份”。这解锁未来肌群训练分析的事实基础，但用户页面仍看不到肌群，且没有权重、状态、人体图或专家验证，因此不能称为肌群分析完成。

下一轮执行第 206 轮 Body Metric Registry v2：在不改变旧记录含义的前提下，固定当前九个指标与目标身体组成指标的代码、单位、持久精度、来源能力、可否派生和合理输入边界。本轮不创建体测报告、AI 提取、Body Profile 页面或医学正常范围。

## 7. 参考

- [第 204 轮档案](204-versioned-muscle-model-v1-contract.md)
- [项目状态](../PROJECT_STATUS.md)
- [能力迁移矩阵](../../funcTable.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考](../api/API_REFERENCE.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0199](../architecture/decisions/0199-exercise-muscle-mapping-persistence-api.md)
