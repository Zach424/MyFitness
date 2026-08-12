# ADR-0199：动作肌群关系持久化与训练历史快照

日期：2026-08-12

状态：已接受

## 背景

第 204 轮固定了 `ilens-muscle-model-v1`，但动作目录、训练记录和导出尚未引用该语言。如果只在 starter 代码中临时计算关系，owner 自定义动作无法修订；如果训练读取时实时连接当前目录，动作关系更正会静默改变旧训练、旧洞察及未来 AI 对历史的解释。

关系也不能把“未配置”表达成空训练量，不能让 `core_global` 聚合节点冒充一块具体肌肉，更不能把用户自定义关系描述为专家验证或动作处方。

## 决策

1. 动作关系使用严格 `mapped|unmapped` 判别联合。mapped 固定 `ilens-muscle-model-v1`、1–8 个主肌群、0–12 个次肌群和明确来源；unmapped 固定空数组与空版本/来源，表达 Unknown。
2. 只有 v1 的 25 个 `muscle_group` 可进入动作关系；唯一 aggregate `core_global` 被排除。主/次数组各自唯一且互不交叉，未知 ID、错误版本和未知字段失败关闭。
3. starter 目录升级为 `starter-2026-08-12-v2`。8 个具体动作携带 `starter_catalog` 关系，通用 `mobility_flow` 显式 unmapped，避免把宽泛活动伪装成精确肌群刺激。
4. owner 自定义动作把版本、`user_confirmed` 来源和主/次 ID 数组存入 `user_exercise_catalog_entries`。创建省略或 `null` 均为 unmapped；更新省略表示保留，显式 `null` 表示清除。每次变化继续写完整不可变 revision。
5. PostgreSQL 重复契约边界：数组上限、25 项白名单、唯一、主次不交叉，以及 mapped/unmapped 原子形状都由 CHECK 约束保护。关系不新增全局可变 join 表，避免另一套身份和 revision 权威。
6. 训练动作保存选择时完整 `muscle_mapping` JSON 快照，并随整个 workout revision 固化。目录以后更正、清除或归档都不改变旧训练；同步与异步便携导出必须包含该快照。
7. 训练写入中的关系是客户端从已读取目录复制的选择时快照。本轮不把它描述为服务端重新匹配、专家审阅、训练刺激权重、肌群状态或计划依据；这些需要独立验收。
8. 已执行迁移不可改写。目录关系使用 `0045`；在本地执行后新增的训练快照结构必须进入前向 `0046`，不得修改 `0045` 绕过 checksum。

## 影响

- starter 与 owner 动作第一次共享同一版本化肌群语言，自定义关系拥有 owner、revision、更正、归档、导出和账户删除边界。
- 旧客户端仍可创建/更新不带映射的动作；API 输出把缺失统一显式为 unmapped，不把 Unknown 变成零。
- 训练历史解释不再依赖可变目录，但当前 JSON 快照仍须由共享 Schema 保护；未来聚合接入前应补服务端目录匹配策略和内容专家审阅。
- 客户端引入无 Zod 的共享 muscle ID 常量，双端产物必须重建并通过原预算，不允许为新基础语言放宽包体门禁。

## 备选方案

### 训练查询时实时连接动作目录

拒绝。目录 correction/archive 会静默重写历史训练语义，且 starter 与 owner 目录的生命周期不同。

### 为 starter 和自定义动作建立统一可变关系表

拒绝。starter 是版本化产品代码，自定义动作是 owner 数据；强行合表会制造发布版本、owner revision 和账户删除之间的第二权威。

### 给所有未明确动作自动映射一级区域

拒绝。粗粒度猜测会把 Unknown 变成看似精确的训练事实，并可能被后续人体图或计划错误消费。

### 在同一迁移中追加训练快照列

拒绝。`0045` 已在验证数据库执行，继续修改会触发 checksum 漂移；前向 `0046` 才符合不可改写迁移纪律。

## 验证

- 定向单元测试 7 个文件、110 项通过；覆盖映射 Schema、aggregate/交叉/版本拒绝、客户端草稿、数据库迁移漂移和便携导出。
- 定向真实 PostgreSQL 测试 2 个文件、5 项通过；全量 PostgreSQL 集成为 29 个文件、177 项通过，覆盖 owner、revision、显式清除、数据库旁路、历史训练快照和导出。
- 全工作区 strict typecheck 与 121 个单元文件、786 项测试通过；OpenAPI 已重新生成，仍为 69 个路径、89 个操作。
- H5 与 WeApp 生产构建通过；入库预算实测 H5 1,278,689/315,457/150,085 字节，WeApp 1,087,098/19,338/48,416 字节，均未放宽预算。

## 关联

- [ADR-0198：版本化 Muscle Model v1](0198-versioned-muscle-model-v1-contract.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 205 轮档案](../../iterations/205-exercise-muscle-mapping-persistence-api.md)
