# 第 162 轮：便携归档递归懒 JSON 来源契约

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 161 轮已经证明 workout 必须分层，但当前 TypeScript 来源只允许顶层数组懒加载，无法安全表达 workouts 内的 exercises/sets/history。本轮只补齐来源类型与嵌套生命周期证明，不提前实现数据库层。

验收标准固定为：`PortableExportJsonSource` 必须在保留 `PrivacyExport` 根结构的同时递归允许任意数组使用显式私有懒节点；普通 eager export 继续兼容。workout 形状的嵌套 lazy 输出必须与 eager v4 逐字节相同，字段到达前不得拉取。外层取消发生在活动 sets 内时，必须先关闭内层 iterator，再取消根生命周期，并让完成收据保留同一错误对象。

范围不增加 workout 数据库源、迁移、索引、第四协调字段、同步导出变化、KMS、执行器、公开路由、授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-json-stream.ts`：新增 `PortableExportJsonPrimitive` 与导出的递归 `PortableExportJsonValue<Value>`；`PortableExportJsonSource` 改为整个 `PrivacyExport` 的递归映射。
- 数组分支同时支持递归 eager 数组和现有 `PortableExportJsonAsyncArray`；对象映射保留原键和可选性，标量不放宽。
- 私有 Symbol、wrapper 工厂、token 编码、块大小、摘要和生命周期代码保持不变，避免无关运行时重构。
- `portable-export-json-stream.test.ts` 新增两个 workout 形状场景：三层按需/字节兼容，以及活动 sets 取消顺序。
- ADR-0156 固定递归来源与关闭次序；架构、数据库、隐私、已实现 PRD、路线图、R-013 和项目状态同步更新。

## 3. 实现方法

1. 读取第 161 轮状态、档案、ADR-0155 和 ADR-0150，区分“运行时已经递归”与“静态类型只允许顶层”的真实缺口。
2. 使用分布式条件类型映射 JSON 标量、数组和对象，不引入第二套运行时节点或通用 unknown 逃生口。
3. 把 `PortableExportJsonSource` 直接建立在 `PrivacyExport` 上，确保根字段和必填数据契约不漂移。
4. 用显式类型注解构造 workout：workouts 本身保持普通数组，exercises/history 使用懒 wrapper，每个 exercise 的 sets 使用各自的懒 wrapper。
5. 首块后检查三个请求计数为零，证明对象前缀输出不会预读深层数据；完整消费后与 eager 产物对账字节、大小和 SHA-256。
6. 第二场景使用 1 字节块推进到首个 set；记录内层 generator 的 finally 和根 lifecycle 回调，在外层 `return()` 后验证先后条件。
7. 先运行目标 11 项 JSON 测试与 API typecheck，再执行完整单元、集成、strict 类型和生产构建。
8. 完成中文档案、治理门禁与 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标增量 JSON 单元测试为 1 个文件、11/11 项通过；API strict typecheck 通过。
- 显式 `PortableExportJsonSource` 接受嵌套 exercises、sets 和 history wrapper，普通 `PrivacyExport` 继续通过现有测试和全量类型检查。
- 首个 29 字节块后请求计数为 exercises/sets/history = 0/0/0；完整消费后为 2/3/2。
- 嵌套 lazy 输出与 eager v4 逐字节相同，完成收据的 byteLength 和 SHA-256 对账。
- 1 字节场景在 requestedSets = 1 时取消；活动 sets 的 finally 在根 cancel 之前执行，根 complete 保持 false，收据与 cancel 接收同一未完成错误。
- 完整单元为 98 个文件、520/520 项；完整集成为 23 个文件、88/88 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式、生产依赖、中文与文档索引门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- Obsidian 镜像完成写入并逐字节验证：70,296 字节，SHA-256 为 `e96d7621071a62c8ee6bb6f4c3ec02c14944a8c07f82533738e79c634d49f2fe`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- 运行时支持不等于工程能力完成；strict 类型如果不能表达合法组合，后续实现会被迫使用断言并失去审查边界。
- 递归条件类型应从权威 `PrivacyExport` 推导，而不是另写一份字段列表，否则 Schema 增减会造成静默漂移。
- 懒数组 wrapper 必须继续使用私有 Symbol。递归放宽并不意味着任意 iterable 都应被序列化为数组。
- “根取消被调用”还不够；必须断言活动内层来源已经先关闭，数据库连接释放顺序才有可验证的接入点。
- 小块测试是调度工具，不是生产参数。1 字节使首个 set 与第二个 set 之间的取消点稳定可复现。
- 类型轮也需要完整构建，因为复杂递归条件类型可能只在其他工作区消费者或 declaration/build 配置中暴露问题。

## 6. 全局状态、项目反思与下一步

本轮把训练分层所需的嵌套来源从隐含运行能力变成 strict 契约，并证明深层取消不会越过活动来源直接完成文件根。这提高了后续处理大型训练证据的可验证性，没有改变用户事实、导出内容或产品界面。

Inspect → Rank → Improve → Validate 的下一步应建立 workout 全历史头部 keyset：只投影会话标量，不聚合 exercises/history；按 `(started_at,created_at,id)` 覆盖活动与软删除记录，并随查询新增非部分 owner 索引和真实 PostgreSQL 计划/隔离/取消证明。该头源尚不能单独接入 v4，因为空嵌套数组会丢失证据；它只作为后续分层组装器的外层游标。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 161 轮档案](161-portable-export-workout-nested-boundary.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0156](../architecture/decisions/0156-portable-export-recursive-lazy-json-source.md)
