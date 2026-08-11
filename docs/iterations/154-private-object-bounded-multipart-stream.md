# 第 154 轮：私有归档有界 multipart 对象写入

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。按“影响 × 置信度 × 基础价值 / 成本”重新比较有界数据库快照、对象写入和 KMS lease 后，最高杠杆缺口是对象边界：前两轮已经能连续产生认证密文字节，但现有存储服务仍要求完整 Buffer。数据库批次读取若先落地，尚无能可靠背压、条件提交和中止残留的下游；本地 KMS 抽象也不会提供真实密钥保管证据。

范围只为私有对象服务增加 multipart 字节流 writer 和真实 MinIO 集成测试。现有照片/账本 Buffer 写入保持不变；不连接归档数据库状态、worker、租约、KMS 数据密钥、下载授权、公开 API、客户端、保留扫描或擦除协调。

验收标准固定为：未知长度字节源按有界部件串行上传；每部件由存储方校验 SHA-256；完整摘要/大小只在条件完成后发布；同键竞争不覆盖；源错误与主动取消都会中止；中止失败保留双错误；真实 JSON→认证加密→MinIO 两部件链四层收据对账；三种失败路径都无错误对象或 multipart 残留。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/operations/object-storage.service.ts`：新增 multipart 命令、5–64 MiB 有界重分块、10,000 部件/安全整数门禁、部件与全对象 SHA-256、条件完成、AbortSignal 和失败中止；两条写入路径共享 SSE 配置。
- `apps/api/src/operations/object-storage.service.test.ts`：新增两项单元测试，覆盖中止失败双错误和非法部件配置创建前拒绝。
- `apps/api/src/operations/object-storage-stream.integration.spec.ts`：新增四项真实 MinIO 集成测试，直接组合 JSON、AES-256-GCM 与对象 writer，并检查对象和未完成 upload。
- ADR-0148 固定 multipart 布局、串行背压、checksum、条件创建、中止与未接数据库状态范围。
- 架构、隐私所有权模型、已实现 PRD、路线图、R-013 与项目状态同步区分“对象 writer 已验证”和“异步导出仍不可用”。

## 3. 实现方法

### 先验证提供方语义再固化接口

官方 S3 API 表明 `CompleteMultipartUpload` 可使用 `If-None-Match: *`，但本轮仍先对固定本地 MinIO 做独立探针。探针上传 5 MiB 加尾部两个部件，首次条件完成成功且下载 SHA-256 相同；同键第二次完成返回 412，中止后原对象不变。只有该兼容性成立后才实现服务接口。

### 用串行部件形成背压

writer 把任意输入切成默认 8 MiB、允许 5–64 MiB 的部件。一个部件只有在 `UploadPart` 返回 ETag 与可核对 checksum 后才加入完成清单并读取下一部件；没有预取或并发队列，峰值内部缓冲由一个部件限制。最后部件可更小，空输入使用一个零字节末部件。

### 分开传输校验与完整保管收据

每部件 SHA-256 以 base64 发送，并在响应提供 checksum 时再次比较；这让存储方拒绝损坏部件。writer 同时按原始顺序累计完整密文 SHA-256 hex 与字节数，但只在最终完成成功后返回。multipart ETag 不作为完整哈希，也不会进入归档收据。

### 让取消不取消清理

AbortSignal 作用于创建、部件上传和最终完成，并在读取每个源块前检查。任何失败都会用不携带该 signal 的独立请求执行 abort；否则已取消信号会立即取消清理本身。若 abort 也失败，`AggregateError` 同时保留根因和清理失败，交给未来任务状态记录，而不是发布完成或丢掉责任。

## 4. 验证证据

- 新增 1 个真实集成文件、4/4 项通过；完整集成为 22 个文件、76/76 项。
- 超过 5 MiB 的 v4 长值经增量 JSON、认证加密和 writer 形成精确两个部件；JSON 明文字节/SHA-256、加密密文字节/SHA-256、writer 收据与下载对象摘要全部一致，认证解密后再次回到相同明文摘要。
- 已存在对象上的第二次 multipart 条件完成返回 `ObjectAlreadyExistsError`，下载仍为原始字节；未完成 upload 列表为空。
- 源在第一个完整部件上传后抛错，不产生对象且没有 multipart 残留。
- AbortSignal 在第一个完整部件上传后取消，第二部件不上传，不产生对象且没有 multipart 残留。
- 新增 1 个单元文件、2/2 项通过；中止失败时 `AggregateError.errors` 按顺序保留源错误与 abort 错误，非法部件配置在任何 SDK 命令前拒绝。完整单元为 96 个文件、500/500 项。
- 本轮没有客户端源码、UI、路由或产品文案变化，因此不重复浏览器套件与双端构建；最近完整 Chromium 基线仍为 95/95，H5/WeApp 产物沿用第 146 轮实测。
- 完整 strict 类型、生产构建、格式、生产依赖、中文和文档索引门禁均通过。
- Obsidian 镜像完成写入并逐字节验证：67,387 字节，SHA-256 为 `c646d77b6bcaa6804fc66c3d56d36bd015cebc73161064770a99512e08193e80`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- “SDK 接受 stream 类型”不足以证明未知长度、checksum trailer 和 S3 兼容提供方都可靠；multipart 把可测试的部件与最终可见边界显式化。
- 条件创建必须放在 `CompleteMultipartUpload`。先 `HeadObject` 再上传存在检查—使用竞态，无法保护确定性归档键。
- 每部件 checksum 与完整对象 hash 责任不同：前者证明传输部件，后者对账加密产物；复合 ETag 不能替代任一 SHA-256 收据。
- 使用同一个已取消 AbortSignal 执行 abort 会使清理立即失败。清理必须拥有独立取消责任，且失败时不能覆盖原始操作错误。
- 最终完成响应丢失与完成前失败不同：对象可能已经可见，而 abort 返回 upload 不存在。双错误只能防止假成功，不能证明零对象；未来执行器必须用确定性键、对象读取和加密摘要恢复这一歧义。
- 串行部件使中止时没有并发上传仍在继续，因此一次 abort 在当前实现中可验证为无残留；如果未来并行化，必须重新设计多次 abort/列举确认和有界在途部件。
- 本地 MinIO 能证明代码路径和兼容版本，不证明生产桶策略、IAM、KMS、生命周期、复制或真实网络故障。

## 6. 全局状态、项目反思与下一步

本轮把未来便携归档从语义对象一路推进到条件可见的私有密文对象，并为取消和冲突保留明确的无残留责任。这改善长期健康、训练与饮食证据的保管完整性，不改变任何用户事实、状态估计或 AI 计划权威。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一轮应重新比较：repeatable-read 下的有界集合快照、受租约执行器对数据库/对象收据的状态协调，以及 KMS 数据密钥 lease。优先处理能关闭最大真实驻留或跨存储歧义、且可由本地 PostgreSQL/MinIO 故障测试证明的边界。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 153 轮档案](153-portable-export-incremental-json-byte-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0148](../architecture/decisions/0148-private-object-bounded-multipart-stream.md)
