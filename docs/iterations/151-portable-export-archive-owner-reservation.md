# 第 151 轮：便携归档所有者事务预约

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 R（Risk Reduction）。范围只是在第 150 轮保管表之上增加不公开的事务预约/所有者读取服务，并补齐 PostgreSQL `BIGINT` 到 JavaScript `number` 的安全上界。不包括 HTTP 路由、客户端、队列任务、生成执行器、加密实现、对象存储写入、短期下载、保留扫描或账号擦除任务改造。

验收标准固定为：8 个并发同请求只产生一个归档；响应丢失后的同请求返回同一收据；同键不同请求哈希固定冲突；对象键和一小时生成期限只由服务端产生；读取同时限定 active owner 与归档 UUID；跨 owner 和非 active owner 不可见；failed/disposed 不被重置；超安全整数的产物大小在数据库与共享契约同时失败；真实 PostgreSQL、完整类型、测试和构建门禁通过。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-archive.service.ts`：新增内部 Nest 服务，负责 active owner 锁定、事务预约、幂等冲突判定、所有者读取和最小收据映射。
- `apps/api/src/app.module.ts`：注册内部服务；没有新增控制器或公开端点。
- `apps/api/src/privacy/portable-export-archive.integration.spec.ts`：在真实 PostgreSQL 中覆盖并发收敛、响应恢复、哈希冲突、跨 owner/非 active 拒绝、确定性保管字段和终态不复活。
- `infra/postgres/migrations/0030_portable_export_archive_safe_size.sql`：限制 `artifact_byte_size` 不超过 9,007,199,254,740,991。
- `packages/contracts/src/privacy-export-archive.ts` 与测试：公共收据的字节数同步采用 `Number.MAX_SAFE_INTEGER` 上界。
- `apps/api/src/database/schema-drift.test.ts`：把迁移 0030 纳入归档保管漂移证据。
- ADR-0145、架构、数据库、隐私所有权、路线图、R-013 与项目状态同步记录新的内部边界和仍未实现项。

## 3. 实现方法

### 以数据库唯一约束收敛并发

预约先锁定 active owner，再执行 `INSERT ... ON CONFLICT DO NOTHING`。成功插入者返回新收据；其他并发事务等待唯一索引裁决后读取既有行。相同请求哈希获得同一状态，不同哈希返回 409。整个流程不使用更新式 UPSERT，因此不能覆盖已经失败或处置的历史。

### 服务端独占保管命名和期限

归档 UUID 由服务生成，对象键固定为 `<owner UUID>/<archive UUID>.json.enc`，生成期限固定为数据库 `NOW() + INTERVAL '1 hour'`。调用方只表达“同一次请求”，不能指定对象位置、生命周期或保管元数据。

### 所有者状态参与事务

`users.status = 'active'` 的 owner 行以 `FOR SHARE` 锁定到预约事务提交。账号删除流程切换状态时必须与它排序，因此进入 `deletion_pending` 的账户不能再创建任务。读取也连接 active owner，并同时匹配 owner/archive UUID，避免存在性侧信道。

### 在数据库到 JavaScript 的边界守住整数精度

PostgreSQL `BIGINT` 驱动返回字符串，收据映射才转换为 `number`。迁移 0030 先把数据库值限制在 `Number.MAX_SAFE_INTEGER`，共享 Zod Schema 再执行同一上界；这样不会把不同的大整数静默映射为相同 JavaScript 数字。

## 4. 验证证据

- 共享归档契约与迁移漂移为 2 个文件、23/23 项通过。
- 真实 PostgreSQL 归档集成为 1 个文件、3/3 项通过：8 个并发请求只有一行；同键不同哈希返回 409；跨 owner 与非 active owner 返回 404；failed/disposed 重放保留原状态；确定性对象键和精确一小时生成期限通过。
- 超过 9,007,199,254,740,991 的数据库产物大小返回 CHECK 违规；共享收据拒绝超安全整数。
- 迁移 0030 在本地账本中恰好一行，集成清理后 `privacy_export_archives` 为 0 行。
- 完整单元测试共 93 个文件、487/487 项通过；完整集成共 21 个文件、72/72 项通过；完整 strict 类型、生产构建、格式和差异检查通过。
- 本轮没有客户端源码、UI、路由或产品文案变化，因此不重复浏览器套件与双端构建；最近完整 Chromium 基线仍为 95/95，H5/WeApp 产物沿用第 146 轮实测。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 中文门禁与迁移索引验证通过：`docs/` 共 325 份 Markdown；十份活跃权威文档、一份治理规范、17 份待迁移专题、174 份待迁移历史，第 090–151 轮和 ADR-0085–0145 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像完成写入并逐字节验证：66,935 字节，SHA-256 为 `5d9364846cc2e55d772631e5bb4d060b2bee5753a12bc359ec72bced319d6097`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 幂等不是“捕获唯一键错误”即可。并发失败方还需要在同一事务语义下读取已提交行并比较请求指纹，才能同时支持恢复与冲突。
- UPSERT 很容易把任务状态当成可覆盖缓存。敏感归档的终态必须是历史事实，预约重放只能读取，不能复活。
- owner 过滤不只属于 SELECT。预约前锁定 active owner，才能让账号状态切换与新任务创建形成明确排序。
- 数据库类型范围可以大于应用运行时的精确范围；只在 Zod 输出端检查太晚，必须在持久化边界同时约束。
- 一小时生成期限只约束任务新鲜度，不证明处理能力或 SLA；公开功能仍需执行器、超时回收和可观测性。

## 6. 全局状态、项目反思与下一步

本轮把异步归档从“只有保管表”推进到可被未来控制器/执行器复用的内部意图边界，并消除了重复对象、幂等键混用、终态复活、非 active 账户继续创建任务和整数精度丢失五类风险。由于没有公开路由或执行器，用户仍不会看到无法兑现的 queued 状态。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，第 152 轮应先实现不写对象存储的应用层加密信封/流式输出边界：固定算法与版本、每归档随机数据密钥、非秘密密钥引用、认证附加数据、分块内存上界和篡改失败测试。真实 KMS、云桶、执行任务、下载授权与客户端继续分开，避免把本地密钥替身误称为生产保管。

R-013 保持中等级开放；R-009 和其他风险等级不变。真实云服务、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 150 轮档案](150-portable-export-archive-custody-state.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0145](../architecture/decisions/0145-portable-export-archive-owner-reservation.md)
