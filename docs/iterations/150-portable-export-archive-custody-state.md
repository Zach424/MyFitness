# 第 150 轮：异步便携归档保管状态与数据库边界

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 R（Risk Reduction）。第 149 轮已证明同步导出接近 50 MiB 时的内存压力；本轮范围只是在任何用户请求或对象写入前，建立异步归档共享状态/最小收据和 PostgreSQL 保管约束。不包括公开 API、客户端、生成执行器、对象存储写入、加密算法、签名下载、保留扫描或账号擦除任务改造。

验收标准固定为：状态只能单调转换；最小收据不能包含对象键、密钥引用、URL、令牌、账号 ID 或内容；available 必须有完整对象/密钥/摘要/大小/期限保管证据；failed 不得持有对象；disposed 清除可寻址保管引用；同状态不得替换证据；owner 未处置归档时物理删除必须失败；共享契约、迁移漂移和真实 PostgreSQL 证明全部通过。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/privacy-export-archive.ts`：定义收据版本、状态/失败码/处置原因、单调转换判定和带时间/状态关系的 strict 最小收据。
- `packages/contracts/src/privacy-export-archive.test.ts`：覆盖安全收据、保管字段排除、状态特定证据和转换图。
- `packages/contracts/src/index.ts`：从共享契约包公开归档契约，供未来 API、执行器和客户端共用。
- `infra/postgres/migrations/0029_portable_export_archive_custody.sql`：新增 owner 幂等意图、确定性 `.json.enc` 键、密钥引用、产物收据、期限、失败/处置状态、部分索引、生命周期 CHECK 和更新触发器。
- `apps/api/src/database/schema-drift.test.ts`：锁定迁移关键字面量并拒绝 URL/访问令牌字段。
- `apps/api/src/privacy/portable-export-archive.integration.spec.ts`：使用真实 PostgreSQL 验证幂等、转换、证据不可变和账号删除阻断。
- ADR-0144、数据库设计、架构、隐私所有权、路线图、R-013 和项目状态同步记录边界与未实现项。

## 3. 实现方法

### 把任务状态与对象处置分开

queued/generating 表示尚无可下载产物；available 只有完整保管元数据才成立；failed 明确没有对象；deletion_pending 表示对象仍可能存在且不再可下载；disposed 表示对象键和密钥引用已清除。这样“任务结束”不会被误当成“对象已删除”。

### 收据不携带访问能力

共享收据仅保留归档 UUID、状态、时刻、可选 SHA-256/大小和受控错误/处置。对象键、密钥引用、URL 与令牌没有字段，strict Schema 对额外字段失败。未来下载必须重新验证 owner、available 状态和期限，再签发短期能力。

### CHECK 负责形状，触发器负责历史

CHECK 约束每个状态当前必须/禁止的字段；触发器比较 OLD/NEW，防止 queued 跳到 available、终态回滚、生成期限/身份变更、更新时间倒退，以及在同一状态下替换摘要、大小、对象键或密钥引用。只有 generating → available 可以首次发布产物证据，只有 deletion_pending → disposed 可以清除对象与密钥引用。

### 以 RESTRICT 防止孤儿对象

归档表不随 users 级联。对象可能位于事务外的存储系统，所以数据库必须在归档行仍存在时拒绝物理删除 owner。未来擦除执行器需要先完成对象删除和 disposed，再删除归档行；本轮没有把这一责任伪装成已经实现。

## 4. 验证证据

- 共享归档契约与迁移漂移为 2 个文件、23/23 项通过，其中本轮新增 4 项。
- 真实 PostgreSQL 归档保管集成为 1 个文件、2/2 项通过；重复幂等键、非法跳级、缺失密钥发布、同状态摘要替换和未处置 owner 删除均被拒绝。
- 合法 queued → generating → available 与 queued → deletion_pending → disposed 路径通过；后者删除归档行后 owner 可删除。
- 首次集成运行发现 `ON DELETE RESTRICT` 返回标准 `23001 restrict_violation`，修正测试预期后通过；迁移语义未改变。
- 迁移实跑后的两次提交前复核分别发现“合法状态内可替换证据”和“可在生成截止后发布”的设计缺口；每次都先确认本轮新表为 0 行，再只删除空 `privacy_export_archives`、触发函数和 0029 迁移记录，重新应用加强后的迁移。既有表和用户数据未触碰；最终迁移账本为 29，归档表测试后为 0 行。
- 完整单元测试共 93 个文件、487/487 项通过；完整集成共 21 个文件、71/71 项通过；完整 strict 类型、生产构建、格式和差异检查通过。
- 本轮没有客户端源码、UI、路由或产品文案变化，因此不重复浏览器套件与双端构建；最近完整 Chromium 基线仍为 95/95，H5/WeApp 产物沿用第 146 轮实测。
- 生产依赖审计为 0 个 critical/high、9 个已登记 moderate。
- 中文门禁与迁移索引验证通过：`docs/` 共 323 份 Markdown；十份活跃权威文档、一份治理规范、17 份待迁移专题、174 份待迁移历史，第 090–150 轮和 ADR-0085–0144 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像完成写入并逐字节验证：67,051 字节，SHA-256 为 `3c223c449f123678fb81351b9a6036f8b3ae3badf820eb9534e723b1cdff182c`；权威来源仍是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 状态枚举不等于状态机。没有 OLD/NEW 转换约束时，任何合法枚举都可能直接跳到 available。
- 状态机也不等于证据不可变。允许 `available → available` 普通更新时间时，必须单独阻止摘要、大小、对象键、密钥引用和期限原地替换。
- `ON DELETE RESTRICT` 的 SQLSTATE 是 `23001`，不同于普通 NO ACTION 外键的常见 `23503`；测试应锁定实际数据库语义。
- 对象存储不参与 PostgreSQL 事务，账号外键不能用方便的 CASCADE 代替处置协议；宁可失败关闭，也不能让数据库删除成功后留下无主对象。
- 密钥引用可以持久化但必须是非秘密标识；实际密钥材料不得进入表、收据、日志或客户端。
- 确定性对象键解决重试对账目标，不证明对象存在。只有完整 available 证据和未来对象 HEAD/下载授权验证才能共同形成可下载事实。

## 6. 全局状态、项目反思与下一步

本轮使异步归档从“概念待定义”推进到共享状态词汇和数据库可执行约束。它消除了跳级完成、原地改写证据和账号级联遗留对象三类设计风险，但还没有创建任何归档请求或对象，也没有改变同步导出的内存曲线。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，第 151 轮应实现不暴露公开路由的事务性所有者预约仓储。同一 owner/幂等 UUID/请求哈希必须返回同一 queued 收据；同键不同哈希固定冲突；对象键和生成期限只能由服务端产生；读取以 owner+archive UUID 限定；失败/已处置行不能被预约重置。待该内部边界通过真实 PostgreSQL 后，再分别实现加密生成执行器、下载授权和账号擦除协调。

R-013 保持中等级开放；R-009 和其他风险等级不变。真实云服务、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 149 轮档案](149-portable-export-local-scale-receipt.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0144](../architecture/decisions/0144-portable-export-archive-custody-state.md)
