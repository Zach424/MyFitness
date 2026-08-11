# 第 183 轮：Personal Model P1b 修订与每周回顾契约

日期：2026-08-11

分类：C（Contract）

状态：已完成

## 1. 范围与验收标准

本轮只实现 Personal Model P1b 内部共享契约：不可变完整 `PersonalModelItemRevision`、精确反馈应用与 revised/no-op 结果、Weekly Cognitive Review 结构化内容及 revision/current/history 信封。验收必须证明完整快照身份和精确前驱不漂移，过期、terminal 或时间倒置反馈失败关闭，temporary 有效期一致，低覆盖异议可以保存但不能驱动决策，周回顾拒绝跨 owner、未来、重复、角色错配、数量超限和自由叙事事实。

本轮不实现数据库迁移、repository、确定性派生器、生成命令、API、OpenAPI、客户端或 AI 文案。P1b 的 fingerprint/watermark 只锁定格式和引用，不声明已经实现规范序列化或幂等生成。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/personal-model.constants.ts`
  - 新增 item revision、feedback transition、weekly review/current/history 版本；固定 revision 动作、no-op 原因、验证问题键和 50 条 history 上限。
- `packages/contracts/src/personal-model.ts`
  - 完整 revision 信封交叉复核 owner/item/revision、精确前驱、动作、反馈 event 和变化时刻。
  - feedback application 只接受当前非终态 item；转换联合区分 revised/no-op，校验下一 revision、事件时间、动作映射与 temporary 有效期。
  - disputed 可以保存低覆盖用户异议，但 decision input 仍严格 active-only。
  - Weekly Cognitive Review 只接受六类结构化卡片，并校验数量、角色、owner、时间、唯一性、本地周和 history 顺序；current 空信封也保留 owner、周、时区和截至时刻。
- `packages/contracts/src/personal-model.test.ts`
  - 在 P1a 13 项上新增 9 项测试，总计 22 项，覆盖修订、反馈转换、低置信异议、回顾内容和 current/history 边界。
- ADR-0177 与 Personal Model、架构、已实现 PRD、数据库/API 边界、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 继续以 P1a 完整 item 作为唯一快照，不设计第二套缩减历史对象。
2. revision 1 只允许 `created + previousRevision: null`，其余动作精确引用 `revision - 1`；动作和反馈/terminal 状态交叉核对。
3. 先用 feedback application 证明事件命中当前 owner/item/revision，再由结果联合证明 revised 精确推进或 no-op 不生成伪历史。
4. 对 temporary 单独比较 `contextValidUntil` 与 item `validTo`，使不同阶段上下文产生材料性修订。
5. 把“允许用户不同意”与“允许条目驱动决策”分离：disputed 可以低置信，decision schema 保持 active-only。
6. 回顾不保存自由模板文案，只保存受限角色的精确修订引用；未来展示层可由版本化模板渲染，但不能新增事实。
7. current 信封显式允许空，但空/非空都保留 owner、周、时区和证据截至时刻；history 只表示单个 review 的同周修订，最大 50 条、最新优先。
8. 目标测试和 contracts 类型通过后更新权威文档，再运行完整仓库门禁。

## 4. 验证证据

- Personal Model 目标测试：1 个文件、22/22 项通过。
- contracts 目录目标回归：19 个文件、109/109 项通过；contracts strict typecheck 通过。
- 完整单元测试：102 个文件、593/593 项通过。
- 完整集成测试：23 个文件、130/130 项通过。
- 完整 strict typecheck 与生产构建通过；H5 只有既登记的 308 KiB、Taro dynamic import 和 webpack cache 警告。
- 客户端质量门禁通过：H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均在既有预算内且无禁用标记。
- 生产依赖审计退出码为 0：0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引通过：`docs/` 共 390 份 Markdown，11 份活跃权威文档；第 090–183 轮 94 份、ADR-0085–0177 93 份连续受保护，待迁移总量保持 191。
- Prettier、10 份变更 Markdown 的相对链接和 `git diff --check` 通过。
- Obsidian 权威状态镜像同步并独立校验通过：71,367 bytes，SHA-256 `7844249b067b7c4f03fa8c1c99fcc115f4f72424ffe5296604fa44fee7a820c3`。

## 5. 发现的问题与经验

- 本轮最重要的分层经验，是先把“用户说了什么”“系统当前认为是什么”“历史上曾经是什么”拆成三个互相引用但不能互相覆盖的对象。用户反馈是追加事实，当前条目是可更新聚合，模型修订是不可变历史。只有这样，用户之后更正资料、撤回记录或改变看法时，系统才能同时保留当时依据和当前结论，而不是用最新值覆盖过去。
- 时间关系必须像所有者关系一样逐层校验。事件不能早于它所评论的认识，新修订不能早于触发它的事件，回顾不能引用截至时刻之后形成的条目。单独校验每个时间字段格式并不能阻止时间倒置；真正保护历史语义的是对象之间的顺序约束。
- 每周回顾刻意只保存结构化选择结果，不保存系统临时生成的长篇总结。这样既降低敏感文本扩散，也让用户能逐张卡片返回来源、提出异议或请求更正。表达层以后可以改写语气和模板，但不能趁机新增没有证据的事实。
- “不同意”是用户观点，不应以统计门槛作为保存资格；但它也不应成为提高置信或驱动建议的捷径。disputed 与 active-only decision schema 必须同时存在。
- 只比较 feedback state 会把不同 temporary 有效期错误折叠成 no-op。阶段上下文的结束时刻属于材料性状态。
- 完整 revision 信封既要校验前驱，也要校验完整快照的 owner/item/revision 和时间，否则合法外壳仍可包住其他条目。
- 回顾的严格数组上限不足以阻止模型编造；还必须拒绝额外 narrative 字段，并让每张卡精确绑定当时条目修订和证据指纹。
- current 回顾可以为空，但仍要说明为空的是谁、哪一周和哪个证据截至时刻；单个历史分页不应为空。两个信封表达的是不同读取语义。
- history 页当前只服务单个 `reviewId` 的修订历史，不是跨周摘要列表。后续 API 若需要跨周导航，应新增独立契约，不能弱化现有身份不变量。
- fingerprint/watermark 字段存在不等于幂等生成已实现。规范序列化、事务去重和并发冲突必须在领域服务与 PostgreSQL 阶段单独证明。
- 契约仍不能证明卡片数量、内部术语或用户异议文案容易理解；真实用户理解研究继续是 R-033 的发布门禁。

## 6. 全局状态、项目反思与下一步

P1a/P1b 完成后，衡迹已经有一组可执行的 Personal Model 传输与历史边界，但还没有任何持久化或用户可见认知镜子。当前最重要的缺口从“对象能否表达安全语义”转为“数据库能否在真实并发、所有者隔离、来源撤回与账号删除中保持这些语义”。

下一轮只进入 P2 的第一个最小切片：迁移 `personal_model_items` 与 `personal_model_item_revisions`，实现最小 repository，并用真实 PostgreSQL 验证 owner 复合键、完整快照不可变、current revision 原子推进、过期 expected revision 失败关闭与账号删除边界。反馈、证据和回顾持久表继续拆轮，API 与客户端仍不开放。

## 7. 参考

- [第 182 轮档案](182-personal-model-core-contract.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0177](../architecture/decisions/0177-personal-model-revision-and-weekly-review-contract.md)
