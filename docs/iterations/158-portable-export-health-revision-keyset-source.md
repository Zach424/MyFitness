# 第 158 轮：便携归档健康修订有界行源

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。比较 `healthRecordRevisions` 与 `consentEvents` 后，前者体量随更正增长、直接保存纵向事实变化，也包含可检验 64 KiB 门禁的来源元数据，因此在“影响 × 置信度 × 基础价值 / 成本”中优先。

验收标准固定为：修订排序必须形成含 UUID 的数据库全序；分页不往返时间戳；默认 25/最大 100 行与 64 KiB payload 门禁复用；同微秒/同 revision 不重不漏，并发追加隔离、跨 owner 排除；懒 v4 与 eager 逐字节一致，超限内容不出库且收据同根失败。

范围只增加第二个独立行源和索引，不把健康记录与修订伪装为同一个事务快照，不迁移其他集合、同步 HTTP、归档执行器、KMS、公开路由、下载授权或客户端。

## 2. 项目结构、设计、技术与实现功能

- `infra/postgres/migrations/0031_portable_export_health_revision_index.sql`：新增所有者修订导出索引 `(user_id, changed_at, revision, id)`。
- `apps/api/src/privacy/portable-export-database-snapshot.ts`：抽取通用快照选项/收据、active owner、页面 payload 校验与会话完成内核；新增健康修订 UUID 锚点行源。
- `apps/api/src/privacy/portable-export-database-snapshot.test.ts`：证明修订方法复用批次与 payload 收据。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`：新增修订稳定分页/索引/并发/所有者/v4 字节组合和异常 payload 两项真实 PostgreSQL 测试。
- ADR-0152 固定修订总序、独立事务范围与多集合协调缺口；架构、数据库、隐私、PRD、路线图和 R-013 同步更新。

## 3. 实现方法

1. 读取第 157 轮状态、档案和 ADR-0151，再检查同步导出投影、两张候选表、现有索引和 v4 Schema。
2. 依据纵向证据价值与潜在体量选择健康修订；确认原 `(changed_at, revision)` 缺少唯一尾键，新增迁移 0031。
3. 把健康记录已有的选项、收据、active owner、页面大小、payload 字节/JSON/ID 校验和完成传播抽成共用函数，并用完整回归保护原行为。
4. 修订 SQL 保留同步导出的字段投影，以 `(changed_at, revision, id)` 升序读取；应用只保存末 UUID，数据库在同一快照中回查锚点。
5. 真实夹具刻意生成同 `changed_at`/同 revision 的不同记录，以 UUID 排序对账；第一页后插入另一修订，确认既有快照不可见。
6. 把新源放入 `healthRecordRevisions` 懒数组，与 eager v4、41 字节块、大小和 SHA-256 对账；另用异常 `source_metadata` 证明 64 KiB 门禁复用。
7. 运行目标单元/API 类型/目标 PostgreSQL，再执行完整单元、集成、类型、构建和项目治理门禁。

## 4. 验证证据

- 数据库快照目标文件为 6/6 项单元测试通过；完整单元为 98 个文件、511/511 项。
- PostgreSQL 快照组合文件为 7/7 项集成测试通过；完整集成为 23 个文件、83/83 项。
- `pg_indexes` 返回修订导出索引的精确四列顺序；五条 owner 修订以两行批次跨三页，同时间/同 revision 依 UUID 总序且其他 owner 不出现。
- 第一行发出后并发插入的修订对当前快照不可见；后续新快照读取六条并与 lazy v4 对账。
- 41 字节块输出与 eager 产物逐字节相同，数据库批次/行数和 JSON 字节数/SHA-256 收据一致。
- 异常修订 `source_metadata` 的数据库独立字节数与错误相同，敏感标记不进入 JSON，行源/数据库/JSON 失败保持对象恒等。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式、生产依赖、中文与文档索引门禁均通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- Obsidian 镜像完成写入并逐字节验证：68,749 字节，SHA-256 为 `b4f229387af01fce29f361c18b36a19de5e5103011aa491e74ddac637b94b4d4`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 纵向修订不是当前记录的附属备份；它是用户更正权与状态演化的证据，导出顺序必须独立稳定。
- 数据库排序必须有唯一尾键。`changed_at` 与 revision 都可能跨不同记录重复，UUID 才能收束成可分页总序。
- 共享“页面解析与收据”并不等于共享事务。两个方法即使使用相同服务，也会各自取得连接和快照；文档与 API 命名必须避免过度声明。
- 当前 JSON 生成器能在活动数组取消时沿 `for await` 回滚，但若未来同一事务跨越多个懒字段，字段之间没有活动内层迭代器，必须增加根级生命周期保管。
- 第二个源进一步验证了 64 KiB 门禁可以复用，但不能从两个平坦集合外推嵌套训练、餐食、计划或媒体的内存行为。

## 6. 全局状态、项目反思与下一步

本轮让更正历史首次获得与当前健康记录相同的数量、元素、所有者、时间精度和 v4 字节边界，增强了 Personal Cognitive Mirror 对“事实发生过怎样的修订”的长期可携带性。它没有改变健康事实、AI 判断或用户界面。

Inspect → Rank → Improve → Validate 的下一步不应立即增加第三个独立行源，而应先设计多集合协调器：健康记录和修订必须共享一个 repeatable-read 事务、按 v4 字段顺序延迟读取，并在活动数组、字段间空隙或外层 JSON 取消时统一回滚。只有根生命周期与统一收据得到真实数据库证明，才继续迁移 `consentEvents`。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 157 轮档案](157-portable-export-database-payload-byte-gate.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0152](../architecture/decisions/0152-portable-export-health-revision-keyset-source.md)
