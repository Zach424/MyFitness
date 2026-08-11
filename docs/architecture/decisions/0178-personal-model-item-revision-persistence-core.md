# ADR-0178：Personal Model item/revision 最小持久内核

日期：2026-08-11

状态：已采纳

## 背景

ADR-0176 与 ADR-0177 已固定 Personal Model P1a/P1b 的结构化 item、证据/置信、Unknown、反馈事件、完整 revision 和 Weekly Cognitive Review 机器契约，但这些对象还没有数据库所有者隔离、不可变历史或并发发布证明。若直接以一个可变 JSON 行保存当前条目，历史可能被覆盖；若只依靠应用递增 revision，两个并发写入可能从同一前驱发布不同的“下一版”；若先接受反馈型 revision 而没有独立反馈事件，后续又无法证明用户实际选择和修订结果不可分离。

本轮只建立 P2a item/revision 最小 PostgreSQL 内核和内部仓储。不建立反馈、证据或回顾表，不装配 API 模块，不修改 OpenAPI、派生器或客户端。

## 决策

1. `personal_model_items` 只保存稳定的 `id`、`user_id`、三个当前已开放 subject 之一、`current_revision`、创建和更新时间。完整业务内容只存在 revision 快照中，避免当前行与历史内容形成双写权威。
2. `personal_model_item_revisions` 保存共享 `PersonalModelItemRevision` 的完整 JSONB 快照，并重复 owner、item、subject、revision、前驱、动作、反馈事件、创建和变化时刻等数据库可检查字段。仓储写入前和读取后都必须执行共享完整 Schema 校验；数据库核心检查不能替代 claim/evidence 算术和跨字段契约。
3. item 建立 `(user_id,id)`、`(user_id,subject)` 与 `(user_id,id,subject)` 唯一约束。revision 通过 owner/item/subject 复合外键绑定 item，禁止合法 UUID 被用于其他用户或其他主题的历史链。
4. revision 1 的前驱必须为空；后续 revision 必须精确指向 `revision - 1`，并由可延迟自引用外键证明前驱实际存在。item 的 current 指针通过可延迟外键绑定同 owner、同 item、同 subject、同 revision 的历史行。
5. 一个延迟约束触发器要求每条新 revision 在事务结束前成为 item 当前 revision。创建必须在同一事务写 item 和 revision 1；追加必须在同一事务写完整下一快照并把指针精确推进一位，不能留下未发布分支。
6. item 更新触发器禁止修改身份、倒退时间和跨级 current revision；revision 触发器拒绝 UPDATE 和直接 DELETE。直接物理删除 item 同样失败关闭，只有 `users` owner 级联删除允许清理 item 与全部历史。
7. 内部 `PersonalModelRepository` 在追加前按认证 owner 和 item 执行 `FOR UPDATE`，读取并校验当前 revision，要求调用方的 expected revision 与数据库完全一致，再生成精确下一写入。相同前驱的并发追加只允许一个事务成功，另一事务得到冲突。
8. P2a 不创建第二套简化写入对象。仓储只接受完整 P1b revision，并在返回 current/history 时再次解析数据库 JSONB；异常或被绕过的持久内容失败关闭，不静默修复。
9. 四种用户反馈动作当前必须同时携带 feedback event ID，但独立事件表尚不存在。迁移以明确的 pending 约束拒绝全部反馈型 revision，仓储也做同样的前置拒绝；P2b 建立事件表和复合外键后再替换该临时门禁。
10. history 当前只提供内部按 revision 最新优先、1–50 条的有限读取。公开列表、游标、幂等命令、错误映射、来源传播、便携导出与普通条目删除必须在后续独立设计中完成。

## 影响

- Personal Model 现在有一个可复现的 owner 隔离、完整快照不可变和原子 current 指针持久核心，但还不是用户可见功能。
- 数据库与共享 Schema 各司其职：数据库保护关系、链和发布原子性；共享契约保护完整业务语义。任何一层都不能单独宣称全部正确。
- 期望 revision 与行锁使并发冲突成为显式结果，而不是产生两个合法下一版或最后写入覆盖。
- 账户级删除可以复用现有 users 级联；日常删除、来源撤回和便携导出尚无产品语义，必须保持关闭。
- 反馈型 revision 暂时不可写，避免先制造无法追溯的“用户选择”历史；这会在 P2b 以真实 append-only event 和事务转换替换。
- R-033 的数据库隔离与并发漂移部分得到缓解，但来源偏差、纵向阈值、用户理解和安全内容风险不因建表而关闭。

## 备选方案

### 只保存一个可变 item JSONB

拒绝。当前状态会覆盖形成它的证据、用户校准和历史解释，无法支持审计、来源撤回或便携导出。

### 用变更补丁代替完整 revision 快照

拒绝。长期重放、字段删除和策略升级更容易漂移；P1b 已明确选择完整快照作为修订权威。

### 只在应用层检查 owner 与 revision

拒绝。原始 SQL、未来仓储或维护脚本可能绕过应用，复合外键、唯一约束和触发器必须形成最低数据库边界。

### 在没有 feedback event 表时先允许用户动作

拒绝。仅保存 event UUID 不能证明事件存在、属于同一 owner/item/revision，之后补表也无法可靠修复历史。

### 同轮开放 API 与客户端

拒绝。P2a 只证明内部持久正确性；授权、分页、幂等、删除/导出和页面状态需要各自验收，不能借用仓储测试宣称完成。

## 验证

- 静态 schema drift 测试必须锁定表名、版本、subject、动作、复合外键、前驱/current 指针、不可变触发器和反馈 pending 边界。
- 真实 PostgreSQL 必须证明创建/current/history、精确下一 revision、过期与跨 owner 拒绝、相同前驱并发只有一个成功。
- 原始 SQL 必须证明 revision UPDATE/DELETE、未发布 revision、跨 owner revision 和 item 直接删除失败关闭。
- 账户删除必须真实级联 item 与 revision；目标测试清理后不得遗留 Personal Model 行。
- strict typecheck、完整单元/集成、构建、生产依赖审计、双端客户端质量、中文文档、迁移清单、Obsidian 和 Git 差异门禁全部通过后才能提交。

## 关联

- [ADR-0176：Personal Model P1a 核心共享契约](0176-personal-model-core-contract.md)
- [ADR-0177：Personal Model P1b 修订、反馈转换与每周回顾契约](0177-personal-model-revision-and-weekly-review-contract.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [已实现产品需求文档](../../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 184 轮档案](../../iterations/184-personal-model-item-revision-persistence-core.md)
