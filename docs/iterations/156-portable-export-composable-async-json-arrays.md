# 第 156 轮：便携归档 v4 JSON 可组合异步数组

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。按“影响 × 置信度 × 基础价值 / 成本”比较新增更多数据库行源、先做单元素字节门禁和连接 JSON 组合后，最高杠杆是让第 155 轮健康记录行源真正进入 v4 字节流；否则继续增加行源仍会在编码前被收集为数组，不能形成背压或传播取消。

范围只让 v4 `data` 数组字段接受显式同步/异步懒节点，并用 `healthRecords` 做首个真实组合。同步控制器、其他数据库集合、嵌套聚合、照片媒体、归档状态、worker、KMS、下载授权、公开 API 和客户端均不改变。

验收标准固定为：普通与懒数组共用格式实现；根前缀输出时不提前请求行；字段顺序、缩进、转义、末尾换行逐字节兼容；懒源错误保持原错；完整消费后数据库/JSON 收据对账；外层提前停止关闭内层行源、回滚事务并拒绝两层收据。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-json-stream.ts`：新增私有 Symbol 标记的 `portableExportJsonAsyncArray()`、`PortableExportJsonSource` 映射类型，以及普通/懒数组共享的异步 token 和 UTF-8 聚合器。
- `apps/api/src/privacy/portable-export-json-stream.test.ts`：新增两项测试，覆盖按需拉取、eager/lazy 字节与摘要等价，以及懒源错误透传。
- `apps/api/src/privacy/portable-export-database-snapshot.integration.spec.ts`：新增两项真实 PostgreSQL 组合测试，覆盖健康记录行源进入完整 v4 和 JSON 提前停止回滚数据库事务。
- ADR-0150 固定显式节点、共享 token、错误/取消传播和未迁移范围；架构、数据库、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

### 用私有标记表达懒数组意图

wrapper 使用模块私有 `unique symbol`，而不是字符串字段或“检测任意 AsyncIterable”。类型只放宽 v4 `data` 的数组属性，账户、时间、Schema 和单值对象仍沿用现有 `PrivacyExport`。Symbol 不被对象枚举，因此永远不会成为文件字段。

### 让 eager 与 lazy 共享一种格式算法

原同步递归生成器升级为异步生成器。普通数组和懒节点都调用同一个 `jsonArrayTokens()`：只有取到首元素才输出数组换行，元素递归深度和结束缩进完全相同。字符串逐 code unit 转义及 UTF-8 固定 Buffer 聚合保持原算法，只把 token 消费改为 `for await`。

### 依赖结构化异步迭代器关闭传播

最外层字节生成器、UTF-8 聚合器、token 树、懒数组和数据库行源都使用 `for await`。调用方执行 `return()` 时，各层自动关闭当前内层迭代器；数据库流事务发现未到 EOF 后回滚。JSON 和数据库完成收据各自拒绝，不发布部分成功。

### 分开证明格式与数据库责任

单元夹具证明懒数组不会在根前缀阶段被请求，并覆盖孤立代理项等既有字符串语义。真实数据库组合先用独立快照形成 eager 参考，再启动新快照直接进入懒节点；这允许测试比较精确字节，而生产懒路径本身没有数组收集。

## 4. 验证证据

- JSON 字节源目标文件为 7/7 项单元测试通过；完整单元为 98 个文件、508/508 项。
- PostgreSQL 快照组合文件为 4/4 项集成测试通过；完整集成为 23 个文件、80/80 项。
- 两条懒健康记录单元夹具在首个 32 字节根前缀输出时请求数仍为零；完整输出与 eager 产物逐字节相等，大小和 SHA-256 一致。
- 懒源先输出一行再抛错时，JSON 字节和收据拒绝同一个根错误对象。
- 真实三行健康记录以两批进入字段完整 v4；所有块不超过 37 字节，输出与 eager 参考相同，数据库收据为两批/三行，JSON 字节数和 SHA-256 对账。
- 真实组合在已经拉取首行后停止 32 字节 JSON，数据库和 JSON 收据均拒绝未完成，不提交事务。
- 本轮没有客户端源码、UI、路由或产品文案变化，因此不重复浏览器套件与双端构建；最近完整 Chromium 基线仍为 95/95，H5/WeApp 产物沿用第 146 轮实测。
- 完整 strict 类型、生产构建、格式、生产依赖、中文和文档索引门禁均通过。
- Obsidian 镜像完成写入并逐字节验证：68,312 字节，SHA-256 为 `629a3af381cf241796e9cbf2943bf450b99d79d07adbf81743c77ac2d16318b4`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- “支持 AsyncIterable”如果靠鸭子类型，会把业务对象的迭代能力误当 JSON 结构。私有 Symbol wrapper 同时缩小类型和运行时识别面。
- 异步 token 化不能另建格式实现；普通数组和懒数组共享同一换行/缩进路径，才有可持续的逐字节兼容证明。
- 外层生成器的 `return()` 会通过 `for await` 关闭当前内层迭代器，这比额外维护一套取消回调可靠；但真实执行器仍需要 AbortSignal 和租约截止时间处理长期无消费状态。
- 逐文件 `maximumBytes` 只会在编码时拒绝，数据库行已经进入进程；单元素/单片段字节边界仍必须前移到数据库 payload 交付处。
- 只有健康记录数组不再完整驻留；其余十二个顶层集合和嵌套子集合仍可能主导内存，不能用一个组合测试外推完整规模。

## 6. 全局状态、项目反思与下一步

本轮把“稳定健康快照”与“逐字节兼容 v4”首次真正连成一个背压链，并证明用户停止消费时不会把部分数据库读取误记为完成。它改善数据可携权的长期一致性，不改变任何健康事实、状态估计、AI 建议或医疗边界。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一轮应优先为数据库 payload/懒数组元素增加读取前可判定或写出前失败关闭的字节上限，再扩展第二个平坦集合。只有先阻止单行异常 JSONB 绕过行数批次，后续“有界”声明才同时覆盖数量和元素大小。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 155 轮档案](155-portable-export-repeatable-read-keyset-source.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0150](../architecture/decisions/0150-portable-export-composable-async-json-arrays.md)
