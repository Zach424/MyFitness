# 中文项目记录规范

最后审阅：2026-08-06

## 目标

MyFitness / 衡迹的项目状态、迭代档案、架构决策和面向维护者的活跃运行手册以中文为主要叙述语言，让产品责任人可以直接审阅范围、风险、验证证据和下一步。代码标识符、命令、文件路径、协议名、标准名、产品名和无法准确翻译的外部专有名词保留原文。

## 权威来源

- `docs/PROJECT_STATUS.md` 是全局项目状态的唯一权威来源；Obsidian 中的同名页面只是逐字节镜像。
- `docs/iterations/` 每轮只新增一份不可改写语义的迭代档案，记录范围、结构、技术、实现方法、验证证据、经验、风险和下一步。
- `docs/architecture/decisions/` 保存需要长期约束实现方式的架构决策；不得把一次测试成功扩大为生产或发布声明。
- 历史英文档案属于既有审计证据，按受控批次迁移；未迁移不代表允许新记录继续使用英文正文。

## 自动检查边界

`pnpm docs:check-language` 执行无第三方运行时依赖的 `myfitness-chinese-documentation/v2` 检查：

- 七份活跃权威文档必须保留约定的中文一级、二级导航标题；产品风险登记册还必须保留审阅元数据、控制职责和关闭条件标记，且风险等级不得恢复为英文；
- `docs/PROJECT_STATUS.md`、`docs/product/PRODUCT_BRIEF.md`、`docs/product/RISK_REGISTER.md`、`docs/product/ROADMAP.md`、`docs/architecture/ARCHITECTURE.md`、`docs/operations/USER_IDENTITY_RUNBOOK.md` 和 `docs/DOCUMENTATION_MIGRATION_INDEX.md` 排除代码与链接后的中文占比均不得低于 72%，且不得存在包含三个及以上英文单词而完全没有汉字的纯英文叙述行；围栏代码块不参与逐行判断；
- 第 090 轮起的迭代档案和 ADR-0085 起的架构决策必须使用包含中文的一级标题、`日期：YYYY-MM-DD` 与中文 `状态：` 字段；
- 排除代码块、行内代码、链接目标和 URL 后，每份受检记录至少包含 200 个汉字，且汉字在汉字与拉丁字母总量中的占比不得低于 60%；
- CI 在格式检查后执行相同命令，任何新记录语言回退都会失败关闭。

这些规则用于阻止明显的语言回退，不代替人工审阅。指标不会判断翻译准确性、术语一致性或内容是否完整。翻译既有权威文档时，还应把提交前版本与候选版本的行内代码、链接目标、代码块和数字令牌做集合核对，防止技术语义在自然语言迁移时漂移。

## 术语约定

| 英文/代码术语             | 中文叙述                                 |
| ------------------------- | ---------------------------------------- |
| authoritative             | 权威、权威来源                           |
| acceptance criteria       | 验收标准                                 |
| evidence                  | 证据                                     |
| gate                      | 门禁                                     |
| fail closed               | 失败关闭                                 |
| lifecycle                 | 生命周期                                 |
| custody                   | 保管责任；涉及数据时优先写“数据保管责任” |
| provenance                | 来源与处理凭据；字段名保留 `provenance`  |
| receipt                   | 收据                                     |
| runbook                   | 运行手册                                 |
| controlled preview        | 受控预览                                 |
| internal alpha            | 内部 Alpha                               |
| closed beta               | 封闭测试                                 |
| public release            | 公开发布                                 |
| current / stale / unknown | 当前 / 已过期 / 未知                     |

风险级别使用 `高`、`中`、`低`；依赖审计工具输出的 `critical`、`high`、`moderate`、`low` 保留原始英文，以便和命令结果逐项核对。

## 写作与迁移规则

1. 新文档先用中文陈述用户价值、边界、风险和验证结论，再引用代码字面量与外部协议。
2. 不翻译命令、环境变量、Schema 版本、API 路径、文件路径和测试名称；在中文句子中用反引号标记。
3. 数字证据必须来自本轮实际运行或明确注明沿用哪一轮；未重跑的检查不得写成已通过。
4. 翻译既有文档时保持链接目标、代码字面量、风险级别、验证数字和历史语义不变；每轮只处理一个可复核边界。
5. 最终格式检查完成后再同步 Obsidian，并对状态和当轮档案做逐字节或 SHA-256 一致性核验。
6. 既有文档迁移前先运行 `pnpm docs:check-migration-index`；每份 Markdown 必须恰好归入一个批次，批次完成后同步更新索引、检查策略和保护范围。

## 参考

- [项目状态](PROJECT_STATUS.md)
- [交付路线图](product/ROADMAP.md)
- [产品简报](product/PRODUCT_BRIEF.md)
- [产品风险登记册](product/RISK_REGISTER.md)
- [架构基线](architecture/ARCHITECTURE.md)
- [ADR-0086](architecture/decisions/0086-chinese-documentation-governance.md)
- [中文文档迁移索引](DOCUMENTATION_MIGRATION_INDEX.md)
- [仓库工作约定](../AGENTS.md)
