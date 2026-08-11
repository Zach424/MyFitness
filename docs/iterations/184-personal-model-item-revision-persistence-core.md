# 第 184 轮：Personal Model P2a item/revision 持久内核

日期：2026-08-11

分类：K（Infrastructure）

状态：已完成

## 1. 范围与验收标准

本轮只实现 Personal Model P2a 的第一个最小持久切片：迁移 `personal_model_items` 与 `personal_model_item_revisions`，实现内部仓储，并用真实 PostgreSQL 证明 owner 复合键隔离、完整快照不可变、current revision 原子推进、过期 expected revision 失败关闭、同前驱并发冲突和账号删除边界。

反馈事件、证据引用、Weekly Cognitive Review、来源传播、便携导出、公开 API、OpenAPI、派生器和客户端不在本轮。由于 append-only 反馈事件表尚不存在，全部用户反馈动作必须失败关闭，不能只保存一个无法验证的 event UUID。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0037_personal_model_item_revision_core.sql`
  - 新增 item 当前指针与完整 revision JSONB 历史表，subject 只允许 P1 当前三个主题。
  - 以 owner/item/subject 复合键、精确前驱自引用、延迟 current 指针和延迟发布触发器保护唯一历史链。
  - item 只允许 current revision 精确加一；revision 不可 UPDATE 或直接 DELETE；账户 owner 级联仍可清理全部行。
  - 反馈型动作在 feedback event 表建立前由明确 pending 约束拒绝。
- `apps/api/src/personal-model/personal-model.repository.ts`
  - 新增未装配到 HTTP 模块的内部 `PersonalModelRepository`，只接受共享完整 revision Schema。
  - 创建 item/revision 1 和追加下一 revision 均在单事务完成；追加使用 `FOR UPDATE` 与 expected revision 收敛并发。
  - current/history 读取再次解析完整 JSONB，history 限制为最新优先 1–50 条。
- `apps/api/src/personal-model/personal-model.repository.integration.spec.ts`
  - 五项真实 PostgreSQL 测试覆盖创建/读取、追加/过期/跨 owner、同前驱并发、原始 SQL 绕过和账号删除。
- `apps/api/src/database/schema-drift.test.ts`
  - 新增迁移 0037 静态保真门禁，锁定 P1 版本、subject、动作、复合约束、不可变与反馈 pending 边界。
- ADR-0178 与 Personal Model、架构、数据库、API、已实现 PRD、路线图、风险和项目状态同步声明 P2a 已完成及剩余边界。

## 3. 实现方法

1. 先保持 item 行极小，只保存稳定身份、subject 和 current 指针；历史业务内容全部复用 P1b 完整 revision 快照，避免双写内容权威。
2. 把 owner、item、subject 同时放进唯一约束与复合外键，使任何直接 SQL 都不能把合法 item UUID 绑定到其他用户或其他主题。
3. 用可延迟前驱/current 外键和事务结束时执行的发布触发器支持“先写 revision 或先推进 item”的原子事务，同时拒绝未发布分支。
4. 在仓储层锁定当前 item，校验 expected revision、创建时刻和变化时间，再插入精确下一 revision 并推进指针；并发事务复用相同前驱时后到者读取新 current 后冲突。
5. 共享 Schema 在写入前和读取后验证完整业务对象；数据库只重复保护核心关系与枚举，不假装 SQL CHECK 已覆盖全部 claim/evidence 算术。
6. 触发器根据触发深度区分用户直接物理删除与 `users` 外键级联，使日常历史不可改写且账号删除仍可完成。
7. 对缺少独立 event 权威的反馈 revision 采取双层失败关闭，留待 P2b 用真实事件复合外键和单事务反馈转换替换。

## 4. 验证证据

- 迁移 0037 在本地 PostgreSQL 成功应用，`schema_migrations` 连续至 0037；目标测试清理后两个新表均为 0 行。
- schema drift 目标测试 25/25 通过。
- Personal Model 仓储真实 PostgreSQL 集成测试 5/5 通过。
- API strict typecheck 通过。
- 完整单元测试 102 个文件、594/594 项通过；完整集成测试 24 个文件、135/135 项通过；既有浏览器测试基线仍为 95 项。
- 全仓 strict typecheck、生产构建和生产依赖审计通过，依赖保持 0 个 critical/high、9 个已登记 moderate。
- 客户端质量门禁通过：H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节，WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均在既有预算内且无禁用标记。
- 中文、迁移清单、相对链接和 `git diff --check` 门禁通过；`docs/` 为 392 份 Markdown，待迁移总量保持 191，第 090–184 轮与 ADR-0085–0178 连续受保护。
- Obsidian 权威状态镜像同步并独立校验通过：71,343 bytes，SHA-256 `107c3cf3b226cdb2e75c8a72cb3eb746e29e4ade5689d267fcf75e0ba4112901`。

## 5. 发现的问题与经验

- 第一版迁移只在 JSONB 快照内检查 subject 格式，没有锁定 P1 当前三个 subject。静态 drift 测试立即暴露该漂移，迁移随后改为精确白名单；尚未提交且两个新表均为空，因此只回退本轮两张空表、相关函数和未提交账本行后重放最终迁移，既有 0001–0036 未改动。
- 只用唯一 `(item_id,revision)` 不能证明历史属于认证 owner；把 owner 与 subject 带入复合外键，才能让数据库直接拒绝跨用户或主题错配。
- 可延迟 current 外键只能证明指针指向存在行，不能证明每条新历史都被发布。额外的延迟 constraint trigger 关闭“插入孤立下一版但不推进 item”的分支。
- 对 revision 禁止 DELETE 时必须保留账户级级联，否则隐私擦除会被不可变触发器意外阻塞。真实账号删除测试比只看 DDL 更可靠。
- `FOR UPDATE` 不替代 expected revision；前者序列化当前 item，后者把调用者依据变成显式冲突条件，两者一起才能避免静默变基。
- 数据库核心 CHECK 应保护关系和不可绕过的最低边界，但不能复制不断演进的全部 Zod 业务算法。仓储读取时再次解析可以发现绕过或历史漂移，而不是把异常快照当成合法事实。
- 反馈 revision 若早于 event 表开放，会制造只有 UUID、没有用户动作权威的伪历史。临时禁止比弱引用更容易安全迁移。

## 6. 全局状态、项目反思与下一步

P2a 完成后，衡迹第一次拥有 Personal Model 的真实持久核心：完整 item revision 不再只是传输对象，而是在 PostgreSQL 中具备 owner 隔离、不可变前驱链、原子当前指针、显式并发冲突和账户删除证明。这个结果仍只回答“历史怎样安全保存”，没有回答“反馈事件怎样作为用户权威写入”“来源撤回怎样传播”或“用户如何看到和校准”。因此项目状态仍是内部 Alpha，不能把两张表描述为已经完成的个人认知镜子。

下一轮只进入 P2b：新增 append-only `personal_model_feedback_events`，把精确 owner/item/revision、四选一动作和发生时间持久化，并在一个事务中验证事件与 revised/no-op 结果不可分离、过期目标失败关闭和重复命令边界。证据、回顾、API 和客户端继续拆轮，LLM 仍不拥有事实、状态转换或置信更新权。

## 7. 参考

- [第 183 轮档案](183-personal-model-revision-and-weekly-review-contract.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0178](../architecture/decisions/0178-personal-model-item-revision-persistence-core.md)
