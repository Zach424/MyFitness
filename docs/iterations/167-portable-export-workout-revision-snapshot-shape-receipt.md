# 第 167 轮：便携归档训练修订快照形状收据

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 166 轮已有同根 revision 头，但若直接按当前关系表的 position 规则拆解历史 snapshot，会改变合法旧快照的原始数组顺序。本轮先增加单 revision、无正文的结构/规模收据，冻结旧/新兼容、ordinality 和 64 KiB 前置条件，不提前声称 snapshot 已流式化。

验收标准固定为：一次 active owner 校验、一个只读 `REPEATABLE READ` 事务、精确 owner/workout/revision 绑定；收据只含 Schema、revision 数字、`legacy|extended|mixed`、根/动作/组字节数、计数、两个顺序标志和 `decomposable`。合法旧字段缺失不能失败；未知键、身份不一致、无效数组、重复 position 或任一元素超 64 KiB 必须令 `decomposable=false`。收据不得包含 UUID 或训练正文。

范围不增加迁移、snapshot 元素流、第 166 轮 history 连接、公开协调字段、同步导出变化、路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增 shape Schema/收据类型、生产 SQL、行映射和 `inspectWorkoutRevisionSnapshotShape()`。
- SQL 通过 `workout_revisions → workout_sessions` 同时绑定认证 owner、冗余 revision owner、精确 workout 与 revision UUID，只输出聚合元数据。
- 根键使用严格白名单并校验 snapshot 的 workout/user/revision 身份；exercise/set 使用历史允许键、必需键、数组类型、父级数量和 position 唯一门禁。
- `jsonb_array_elements ... WITH ORDINALITY` 保留不可变数组存储顺序；窗口 `lag()` 只判断该顺序是否恰好与 position 升序一致，不重排任何元素。
- PostgreSQL 计算根头、最大动作头和最大 set 的 UTF-8 字节数，并把 64 KiB 上限纳入 `decomposable`；正文和标识不进入收据。
- 单元新增 shape 映射/无标识收据和 owner-safe not-found 两项；真实集成新增扩展形状无正文、旧版反序 ordinality、未知字段/超限拒绝三项。
- ADR-0161 固定 ordinality、兼容分类、无正文收据与“不等同完整领域验证/流式化”的边界；状态、架构、数据库、训练模型、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 166 轮权威状态、档案和 ADR-0160，审计当前 Workout 契约、初始提交版本与 revision 写入实现。
2. 确认历史根键自初始版本保持稳定，动作在后续版本增加可选 tracking/equipment 字段，组字段形状保持稳定。
3. 发现契约只验证 position 唯一，不验证数组升序；revision 写入保存接受对象的原始数组顺序，因此选择 ordinality 作为未来递归游标。
4. 用 target CTE 沿父表绑定 owner/workout/revision，并仅对精确 revision 展开 JSONB，避免无界账号级诊断结果。
5. 通过安全 CASE 把非数组转为空展开集，同时在独立结构布尔中失败关闭，避免 PostgreSQL 对异常 JSON 类型抛出内容相关错误。
6. 对 exercise/set 分别记录 ordinality、解析 position，并用窗口 lag 计算“存储顺序是否与 position 一致”。
7. 分别聚合旧/扩展动作计数、总动作/组计数、最大头/元素字节和父级 position 唯一性。
8. 将严格根/子键、身份一致、数组、数量、唯一 position 与三类 64 KiB 上界合成为 `decomposable`，未知字段不被忽略。
9. 只把固定类型的数字、布尔与兼容枚举映射到 v1 收据，明确不包含 user/workout/revision UUID。
10. 用数据库替身验证一次账号门禁、一次 shape 查询、映射和 not-found；用真实 PostgreSQL 验证新旧/混合/反序/未知/超限/跨 owner。
11. 先运行目标 31 项单元、26 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建、格式与生产依赖审计。
12. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、31/31 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、26/26 项通过；本轮没有新增迁移。
- 扩展 snapshot 报告 2 个动作、2 个组、`extended`、两个顺序标志为 true 且 `decomposable=true`；秘密动作名、workout UUID 和 revision UUID 均不在收据中。
- 旧版 snapshot 的动作 position `[2,1]`、首动作 set position `[2,1]` 保持合法可分解，同时两个顺序标志明确为 false；跨 owner 返回相同 not-found。
- 一个旧/新动作混合且含未知根键的 snapshot 报告 `mixed` 与 `decomposable=false`。
- 单动作头超过 64 KiB 时只报告超过门禁的最大字节数并令 `decomposable=false`，不返回超长备注。
- 完整单元为 98 个文件、540/540 项；完整集成为 23 个文件、103/103 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档门禁通过；迁移索引确认 `docs/` 共 357 份 Markdown，第 090–167 轮 78 份、ADR-0085–0161 77 份连续受保护，待迁移总量保持 191。
- Obsidian 镜像已写入并逐字节验证：71,052 字节，SHA-256 `e6b1493668a0d749b09f3b83c555c591735faa8ca041e446f8e9ae2db62b166a`。

## 5. 发现的问题与经验

- position 唯一不等于数组已经排序。历史 JSONB 数组 ordinality 是不可变表示的一部分；递归输出若按 position 重排，会制造与原 snapshot 不同的新证据。
- 可选字段演化需要显式兼容分类。旧 snapshot 缺少 tracking/equipment 并非损坏，混合形状也可能来自对旧训练的后续修订。
- “可分解”应比“当前领域 Schema 完全有效”更窄也更稳定：它只证明父链、对象/数组、键、数量、唯一位置和字节边界足够安全地无损拆分。
- shape 诊断本身也应遵守最小披露。计数、分类、布尔和字节数足以决定下一步；返回字段名、UUID 或正文只会扩大敏感运维面。
- 先在 PostgreSQL 计算最大元素字节，可以证明超限正文不必进入 Node；但这不限制数据库内部 JSONB 展开成本，未来仍需租约超时和规模验证。
- 未知字段必须失败关闭而不是静默忽略。未来 Schema 扩展时，应先升级允许键和兼容测试，再允许递归导出。

## 6. 全局状态、项目反思与下一步

本轮没有减少同步导出内存，也没有交付任何 revision snapshot 正文；它把下一轮真正递归流式化所需的历史形状、最小披露和 ordinality 规则变成可执行证据。由此避免了在复杂生命周期代码中晚发现“历史数组被重排”或“旧字段被误删”。

Inspect → Rank → Improve → Validate 的下一步应只处理通过 shape 门禁的单 revision：用 snapshot exercise UUID 恢复 JSON ordinality，按存储顺序分页输出 `exercise - sets`，再为每个 exercise 以 set UUID 恢复组 ordinality；根头、动作头和 set 均继续 64 KiB 失败关闭。该嵌套来源必须接入第 166 轮 history 子流并证明最深层取消，但在完整 byte-compatible v4 组合前仍不公开。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 166 轮档案](166-portable-export-workout-revision-header-lifecycle.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0161](../architecture/decisions/0161-portable-export-workout-revision-snapshot-shape-receipt.md)
