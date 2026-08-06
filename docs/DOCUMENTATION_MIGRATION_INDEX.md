# 中文文档迁移索引

最后审阅：2026-08-06

Schema：`myfitness-documentation-migration-index/v1`

## 目的与边界

本索引把仍需中文化的专题文档、历史迭代档案和早期架构决策划成可复核批次。它只登记迁移范围和顺序，不改写历史结论，也不把“已登记”冒充“已翻译”。每个批次仍须逐份保留链接目标、行内代码、代码块、数字证据和当时语义，并在单独迭代中完成验证、归档和提交。

待迁移总量：193 份（专题 19 份，历史 174 份）。

## 已受门禁保护的范围

- 五份活跃权威文档由 `myfitness-chinese-documentation/v2` 检查中文标题、正文占比和纯英文叙述行：项目状态、交付路线图、架构基线、用户身份运行手册与本索引。
- 第 090 轮起的迭代档案和 ADR-0085 起的架构决策由同一门禁检查中文元数据与正文比例；后续编号自动进入受保护序列。
- [中文项目记录规范](DOCUMENTATION_LANGUAGE_POLICY.md)解释术语、保真要求和人工审阅边界，作为治理文档单独归类。

## 待迁移专题批次

### `topic-product-design`：产品、设计与 API 说明

- [API 说明](api/README.md)
- [设计系统](design/DESIGN_SYSTEM.md)
- [产品简报](product/PRODUCT_BRIEF.md)
- [风险登记册](product/RISK_REGISTER.md)

退出条件：四份文档分别完成中文正文迁移，并以结构签名或提交前后集合核对证明代码字面量、链接和数字未漂移；随后把本批次状态改为受保护。

### `topic-architecture-models`：专题架构模型

- [管理员支持模型](architecture/ADMIN_SUPPORT_MODEL.md)
- [AI 解释模型](architecture/AI_EXPLANATION_MODEL.md)
- [食物照片模型](architecture/FOOD_PHOTO_MODEL.md)
- [健康记录模型](architecture/HEALTH_RECORD_MODEL.md)
- [身份与资料模型](architecture/IDENTITY_PROFILE_MODEL.md)
- [饮食模型](architecture/NUTRITION_MODEL.md)
- [运行边界模型](architecture/OPERATIONS_PERIMETER.md)
- [计划模型](architecture/PLAN_MODEL.md)
- [隐私所有权模型](architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [进度照片模型](architecture/PROGRESS_PHOTO_MODEL.md)
- [训练模型](architecture/WORKOUT_MODEL.md)

退出条件：按一个模型或一个紧密相关模型组分轮迁移；每轮保留字段、状态机、API 路径、风险和决策引用，并把完成文件转入中文门禁。

### `topic-operations-runbooks`：剩余运行手册

- [管理员访问运行手册](operations/ADMIN_ACCESS_RUNBOOK.md)
- [API 运行手册](operations/API_OPERATIONS_RUNBOOK.md)
- [数据保管运行手册](operations/DATA_CUSTODY_RUNBOOK.md)
- [部署运行手册](operations/DEPLOYMENT_RUNBOOK.md)

退出条件：每份手册单独迁移并核对命令、配置键、服务名、告警条件、回滚顺序和参考链接；未经真实演练的步骤继续明确标为待验证。

## 待迁移历史批次

| 批次 ID               | 精确范围         | 文件数 | 迁移顺序与退出条件                                             |
| --------------------- | ---------------- | -----: | -------------------------------------------------------------- |
| `iterations-000-029`  | 迭代档案 000–029 |     30 | 先处理基础、隐私、部署与 AI 早期语义；逐份保留当时验证范围     |
| `iterations-030-059`  | 迭代档案 030–059 |     30 | 处理照片、记录、目录、时间与恢复边界；核对关联 ADR             |
| `iterations-060-089`  | 迭代档案 060–089 |     30 | 处理读取权限、历史、响应丢失与焦点生命周期；核对测试数字       |
| `decisions-0001-0028` | ADR-0001–0028    |     28 | 处理平台、数据、身份、部署、AI 与 OIDC 基线；保持决策/影响关系 |
| `decisions-0029-0056` | ADR-0029–0056    |     28 | 处理照片、聚合、目录、趋势、草稿与恢复；保持契约字面量         |
| `decisions-0057-0084` | ADR-0057–0084    |     28 | 处理读取权限、焦点、删除/更正/导出恢复；保持状态机和失败权限   |

历史批次完成时不得删除或合并文件。批次状态只有在全部文件通过中文元数据、正文比例、链接和技术字面量核对后才能从“待迁移”改为“受保护”；部分完成应拆成更小的连续编号批次，并保持所有文件恰好归类一次。

## 自动检查

`pnpm docs:check-migration-index` 执行无第三方运行时依赖的失败关闭检查：

- 扫描 `docs/` 下全部 Markdown，并要求每份文件恰好属于活跃权威、治理文档、专题批次、历史批次或当前受保护序列之一；
- 拒绝未归类文件、重复归类、登记但缺失的专题文件、历史编号缺口和重复编号；
- 要求本索引保留 Schema、精确待迁移总量、全部批次 ID 和全部专题链接；
- 自动接受第 090 轮以后的连续迭代档案和 ADR-0085 以后的连续决策，但仍由中文正文门禁判断内容是否合格。

该检查证明范围完整，不证明翻译准确。每批迁移仍需要人工语义复核，并继续遵循“一轮一个可验证范围”的仓库协议。

## 参考

- [项目状态](PROJECT_STATUS.md)
- [交付路线图](product/ROADMAP.md)
- [架构基线](architecture/ARCHITECTURE.md)
- [中文项目记录规范](DOCUMENTATION_LANGUAGE_POLICY.md)
