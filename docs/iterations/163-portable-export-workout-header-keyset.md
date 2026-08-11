# 第 163 轮：便携归档训练全历史会话头游标

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 162 轮已经补齐 workout 嵌套懒数组的类型与取消链，但数据库仍缺少一个覆盖软删除会话的外层游标。本轮只建立会话头部 keyset、对应非部分索引和真实数据库证据，不提前交付不完整 v4 workout。

验收标准固定为：来源必须在 active owner 范围内按 `(started_at,created_at,id)` 升序输出活动与软删除会话；只投影 15 个会话标量，不包含 exercises/history 或保管秘密；复用 25/100 行批次和 64 KiB 门禁。真实 PostgreSQL 必须证明三层总序、跨 owner 隔离、并发快照隔离、非部分索引可用于实际 SQL 和取消同根。

范围不增加嵌套动作/组/修订来源、第四协调字段、同步导出变化、公开路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增 workout 头部 session/receipt 别名、实际分页 SQL、页生成器、active owner 包装和 `createWorkoutHeaderSnapshot()`。
- 查询把完整排序锚点留在 PostgreSQL，仅在 Node 保存末 UUID；投影由数据库先编码并计量，继续复用统一 payload 校验和错误类型。
- `infra/postgres/migrations/0032_portable_export_workout_header_index.sql`：新增无谓词的 `(user_id,started_at,created_at,id)` 索引，保留原活动列表部分索引。
- 单元测试新增 workout 头部共享收据证明；真实集成新增总序/owner/软删除/快照、目录与查询计划、取消三项场景。
- ADR-0157 固定头部边界、索引证据和不接入公开 v4 的约束；状态、架构、数据库、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 读取第 162 轮状态、档案、ADR-0150、ADR-0155 与 ADR-0156，确认下一个最小关键路径是外层数据库游标，而不是继续扩展编码器。
2. 从同步 v4 workout 投影复制会话标量白名单，明确排除 owner、幂等键、请求哈希和全部嵌套数据。
3. 沿用健康/同意行源的 `WITH page AS MATERIALIZED`、数据库 JSON 编码、`octet_length` 和 UUID 锚点模式，排序键改为 workout 三元组。
4. 让独立 session 继续复用只读 repeatable-read 生命周期和统一收据；本轮不改变描述驱动协调器。
5. 与查询一起增加迁移 0032 非部分索引，避免误用只覆盖 `deleted_at IS NULL` 的活动列表索引。
6. 反向插入四条具有不同 started_at、created_at 和相同时间 UUID 尾序的记录，以两行批次逐层证明总序；同时加入其他 owner、软删除和首批后的并发新增。
7. 从 `pg_index` 校验索引无谓词与列顺序；在事务内局部关闭顺序扫描，对同一导出 SQL 执行 JSON 格式 EXPLAIN，避免微型夹具成本波动。
8. 在首行后触发 AbortSignal，比较流失败与 receipt 失败的对象恒等，并确认没有第二行跨出。
9. 先运行目标 12 项单元、14 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建、格式与生产依赖审计。
10. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、12/12 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、14/14 项通过，迁移 0032 由校验和迁移器应用。
- 四个 owner workout 由反向插入后按 started_at、created_at、UUID 总序跨两页输出；一条软删除记录保留，其他 owner 与打开快照后的新增记录均不出现。
- 头部对象恰好包含 15 个允许字段，没有 exercises/history。
- PostgreSQL 目录返回无谓词索引，列顺序为 `(user_id,started_at,created_at,id)`；同一实际页查询在事务局部 `enable_seqscan=off` 时命中 `workout_sessions_user_export_idx`。
- 首行后取消时，行流和完成收据拒绝同一个 lease owner 错误对象。
- 完整单元为 98 个文件、521/521 项；完整集成为 23 个文件、91/91 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档与迁移索引门禁通过：`docs/` 共 349 份 Markdown，第 090–163 轮与 ADR-0085–0157 连续受保护，待迁移总量保持 191。
- Obsidian 镜像完成写入并逐字节验证：70,489 字节，SHA-256 为 `d9c3020f40058447385c172ede4e3b9667e2744de93bcf3a45e4d57d115e3f9f`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- “全历史”必须同时体现在 WHERE 谓词和索引谓词；活动列表索引即使列顺序相近，也不能证明软删除证据可导出。
- 外层游标只应携带足以建立父对象的标量。用空嵌套数组补齐 Schema 会把“尚未读取”伪装成“用户没有数据”。
- UUID-only 应用游标可以与完整数据库排序兼容，前提是每页都在同一 owner 快照中回查锚点，不把微秒时间往返 JavaScript。
- 查询计划证据需要说明验证条件。局部关闭顺序扫描证明索引可用性，不应被写成生产优化器选择或容量结论。
- 单独会话头 session 在物理 EOF 后会提交；未来嵌套组装不能简单串接第二个事务，而要在头部 yield 期间保管同一 client/root lifecycle。
- 取消验证应比较错误对象恒等，而不只比较文案，才能证明没有在事务或 session 边界替换根因。

## 6. 全局状态、项目反思与下一步

本轮把 workout 的第一个数据库层从无界聚合拆成可分页、可计量、可取消的所有者全历史头部，并让实际 SQL 与新索引形成可复现证据。它减少了后续分层实现的不确定性，但没有减少当前同步导出内存，也没有向用户发布不完整数据。

Inspect → Rank → Improve → Validate 的下一步应在同一 owner-scoped repeatable-read 根事务中设计单 workout 动作头部 keyset：按 position 输出动作标量，不聚合 sets；外层 workout 头在动作消费期间保持快照和取消责任。仍不得填充空 sets/history 或接入公开 v4。之后再逐层处理 sets 与修订 snapshot，超过 64 KiB 的修订必须继续拆解而不是提高门禁。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 162 轮档案](162-portable-export-recursive-lazy-json-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0157](../architecture/decisions/0157-portable-export-workout-header-keyset.md)
