# ADR-0148：私有对象的有界 multipart 字节流写入

日期：2026-08-11

状态：已采纳

## 背景

第 153 轮已经能把 v4 JSON 直接增量编码并交给第 152 轮认证加密信封，但现有 `ObjectStorageService.putPrivateObject()` 只接受完整 `Buffer`。若未来执行器先收集全部密文再调用该方法，JSON 与加密 codec 的有界处理价值会在对象边界丢失；未知最终长度也无法预先提供单次 `PutObject` 的完整 SHA-256。

S3 multipart 允许先创建未完成 upload、顺序上传有界部件，再以完整部件清单原子完成对象。正式 S3 API 还支持在 `CompleteMultipartUpload` 上使用 `If-None-Match: *`，使条件创建发生在对象真正可见的最终边界。本轮必须先在固定版本本地 MinIO 证明这些语义及中止清理，再把它作为内部归档基础，而不能从 SDK 类型声明推断兼容性。

## 决策

1. 保留现有 Buffer 写入不变，新增内部 `putPrivateObjectStream()`。输入是同步或异步 `Uint8Array` 字节源，可携带私有对象键、媒体类型、元数据、条件创建、部件大小和可选 AbortSignal。
2. 默认部件为 8 MiB；配置只接受 5–64 MiB，最多 10,000 个部件。最后一部件可小于 5 MiB；空源使用一个零字节末部件。超过部件数或 JavaScript 安全整数字节边界时失败关闭。
3. writer 只并行持有当前源块和一个部件 Buffer。每次 `UploadPart` 完成后才继续读取并形成下一部件，不预取、不并发上传，以串行等待形成明确背压，并使中止时不存在仍在飞行的其他部件。
4. `CreateMultipartUpload` 固定 `ChecksumAlgorithm=SHA256` 与 `ChecksumType=COMPOSITE`。每部件本地计算 SHA-256 base64 并显式发送；若存储响应返回不同 checksum 或缺少 ETag，立即失败并中止。完整密文 SHA-256 hex 与安全整数字节数在相同顺序中独立累计。
5. `CompleteMultipartUpload` 使用严格升序且连续的部件编号。`ifAbsent=true` 时只在最终完成请求发送 `If-None-Match: *`；412 映射为既有 `ObjectAlreadyExistsError`，不能覆盖先前对象。
6. 只有完成请求成功后才返回 `{partBytes, partCount, byteLength, sha256}`。源错误、主动取消、上传失败或条件失败都会执行不携带原 AbortSignal 的 `AbortMultipartUpload`，确保取消完成路径不会同时取消清理。
7. 若中止也失败，抛出 `AggregateError` 同时保留原操作错误与清理错误；不能用清理错误覆盖根因，也不能在清理责任未知时降级为普通失败。
8. 现有 SSE-S3/SSE-KMS 配置由 Buffer 与 multipart 两条路径共享。应用层 AES-256-GCM 仍负责归档身份绑定；对象 SSE 是额外提供方静态控制，不替代应用层信封。
9. 本轮不连接 `privacy_export_archives` 状态、不新增 worker/租约/KMS 数据密钥、下载授权、公开 API、客户端 UI、到期扫描或账号擦除协调。

## 影响

- JSON → 认证加密 → 私有对象第一次能够端到端按有界块推进，不需要完整密文 Buffer。
- 每部件存储校验防止传输损坏；完整密文摘要/大小可与加密收据精确对账，但 multipart 的复合 ETag 不被误用为完整对象哈希。
- 条件完成把“同键已有对象”的竞争留到对象原子可见边界；失败后既有对象保持不变，未完成部件被中止。
- 串行上传牺牲并行吞吐以换取清晰背压、固定内存和可证明的取消清理。未来只有在测量表明吞吐不足、并能保留有界并发与多次 abort 扫描时才考虑并行。
- 本地 MinIO 行为不能证明生产 S3 兼容提供方、IAM、KMS、生命周期或故障语义；R-005 与 R-013 都保持开放。
- writer 尚未与数据库状态机形成事务外协调。对象成功但数据库未标记、或数据库租约丢失后的对象处置仍需未来执行器解决。
- 最终完成请求可能已在存储端成功但响应丢失；随后的 abort 会因 upload 已结束而失败，并与原错一起成为 `AggregateError`。这能阻止假成功，却不能证明对象不存在，未来执行器必须按确定性对象键与摘要对账。

## 备选方案

### 用未知长度流直接调用 `PutObject`

拒绝。不同 S3 兼容提供方对 chunked SigV4、尾随 checksum 和未知长度支持不一致，也无法在发送前获得未来加密收据的完整 SHA-256；multipart 的部件与最终完成边界更可验证。

### 把密文先写到本地临时文件

暂缓。临时文件能二次读取并提供总长度，但引入本地敏感数据保留、磁盘容量、崩溃清理和容器卷责任；当前 multipart 可以直接满足未知长度与有界内存。

### 并发上传多个部件

暂缓。并发可提高吞吐，却扩大内存、取消竞态和 abort 后仍在上传的部件窗口。当前没有生产吞吐证据支持这项复杂度。

### 完成前先用 `HeadObject` 检查键不存在

拒绝。检查与完成之间存在竞争，不能替代 `CompleteMultipartUpload` 的 `If-None-Match: *` 原子条件。

### 只依赖 multipart ETag

拒绝。multipart ETag 不是完整对象 MD5 或 SHA-256，且其构造依赖部件边界。完整密文 SHA-256 必须由 writer 与加密收据独立对账。

## 验证

- 固定本地 MinIO 探针必须证明两个部件可按 SHA-256 上传并条件完成，下载字节摘要与输入相同；同键第二次条件完成返回 412 且原对象不变。
- 正式集成测试必须把超过 5 MiB 的 v4 JSON 字节源直接送入认证加密与 writer，产生两个部件；JSON 明文收据、加密密文收据、writer 收据和存储对象摘要必须精确对账。
- 同键既有对象竞争必须抛出 `ObjectAlreadyExistsError`，原对象字节不变，且 `ListMultipartUploads` 不得发现残留。
- 源在首部件后抛错以及 AbortSignal 在首部件后取消，都不得发布对象或留下 multipart upload。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0147：便携归档的增量 JSON 字节源](0147-portable-export-incremental-json-byte-source.md)
- [Amazon S3 CompleteMultipartUpload API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html)
- [Amazon S3 AbortMultipartUpload API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html)
- [Amazon S3 上传完整性校验](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [架构基线](../ARCHITECTURE.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 154 轮档案](../../iterations/154-private-object-bounded-multipart-stream.md)
