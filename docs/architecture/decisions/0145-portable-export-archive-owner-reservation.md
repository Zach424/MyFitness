# ADR-0145：便携归档的所有者事务预约边界

日期：2026-08-11

状态：已采纳

## 背景

第 150 轮已经固定归档状态、最小收据和 PostgreSQL 保管约束，但仓库中还没有负责创建归档意图的应用边界。若未来由控制器、任务或脚本各自拼接 INSERT，同一响应丢失请求可能产生重复对象，不同请求也可能错误复用同一幂等键；客户端选择对象键或生成期限还会扩大保管权限。

本轮需要先建立内部预约服务并以真实并发事务证明语义，同时继续禁止公开路由和用户可见 queued 状态。该服务只能证明归档意图已被安全登记，不能证明执行器、加密对象或下载能力存在。

## 决策

1. 新增内部 `PortableExportArchiveService`，由 Nest 应用容器提供但不挂载 HTTP 控制器。预约输入使用 strict Schema，只接受 UUID 幂等键和 64 位小写十六进制请求哈希；用户 UUID 也在进入数据库前校验。
2. 预约在单一 PostgreSQL 事务中先以 `FOR SHARE` 锁定 active owner，再由服务端生成归档 UUID、`<owner UUID>/<archive UUID>.json.enc` 对象键和精确一小时生成期限。客户端不得提供这些保管字段。
3. `INSERT ... ON CONFLICT (user_id,idempotency_key) DO NOTHING` 负责并发收敛。冲突后读取同一 owner/幂等键：请求哈希相同则返回现有收据，哈希不同则固定返回冲突；不得用 UPSERT 更新或重置状态。
4. owner 读取必须同时限定 active owner UUID 与 archive UUID。无效标识、跨 owner、非 active owner 和不存在记录都使用未找到语义，不泄露归档存在性。
5. 重放只映射数据库当前状态。因此 failed 与 disposed 等终态保持原归档 UUID 和状态，不会重新变成 queued；对象键、密钥引用、请求哈希和 owner 不进入公共收据。
6. PostgreSQL `BIGINT` 产物大小在进入 JavaScript `number` 前必须不超过 `Number.MAX_SAFE_INTEGER`。迁移 0030 与共享收据 Schema 同时锁定 9,007,199,254,740,991 上界，避免精度静默丢失。
7. 本轮不增加公开 API、队列任务、生成执行器、加密算法、对象写入、下载授权、保留扫描、擦除协调或客户端入口。

## 影响

- 控制器和后台任务未来可以复用一个事务预约边界，不再各自实现幂等和 owner 约束。
- 响应丢失后的同请求重试可以得到同一收据；同键不同请求失败关闭，且并发不会创建多个归档目标。
- active owner 行锁把账号状态与预约提交放在同一事务秩序中，避免账户进入删除流程时又创建新归档意图。
- 一小时是当前服务端生成截止策略，不是任务 SLA，也不是下载期限；实际执行器必须独立处理超时、失败和处置。
- R-013 仍开放：预约不会减少同步导出的内存，也不产生可下载产物。

## 备选方案

### 使用 UPSERT 把现有行更新回 queued

拒绝。它会复活 failed/disposed 终态，覆盖保管历史，并让相同幂等键失去响应恢复语义。

### 先查询再插入

拒绝。并发请求会在查询与插入之间竞争；唯一约束仍会报错，但调用方无法稳定得到同一收据。

### 让客户端提供归档 ID、对象键或期限

拒绝。这些是服务端保管和资源控制字段，不能由不可信调用方扩张命名空间或生命周期。

### 立即增加公开预约路由

拒绝。没有执行器、加密对象写入、下载与擦除协调时，公开 queued 请求会制造无法兑现的用户承诺。

## 验证

- 真实 PostgreSQL 中 8 个并发同请求预约必须只产生一行、一个归档 UUID 和逐字段相同的收据。
- 同 owner/幂等键但不同请求哈希必须返回 409；跨 owner、非 active owner 和无效标识必须失败关闭。
- 同请求重放必须保留 failed 与 disposed 终态，不得重置为 queued。
- 数据库中的对象键必须由 owner/归档 UUID 确定性组成，`generation_expires_at - created_at` 必须精确为一小时。
- 超过 `Number.MAX_SAFE_INTEGER` 的产物大小必须被数据库 CHECK 拒绝；共享收据也必须拒绝该数字。
- 定向及完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引与 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0144：异步便携归档的保管状态与数据库边界](0144-portable-export-archive-custody-state.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 151 轮档案](../../iterations/151-portable-export-archive-owner-reservation.md)
