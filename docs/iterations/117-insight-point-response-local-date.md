# 第 117 轮：洞察点响应本地日一致性

日期：2026-08-10

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 E（Temporal Modeling）与 F（Consistency Checking）。范围只有动作与健康洞察点的响应本地日，以及空序列时的响应时区有效性。

验收标准固定为：两个生产构造器即使没有点，也必须在窗口、180 点截断、首点身份/单位和 `hasMore` 派生前拒绝无效 IANA 时区；两个共享 Schema 必须按响应 `timezone` 逐点证明 `localDate = occurredAt local day`，日期错位定位到 `series[index].localDate`，无效时区定位到 `timezone`。健康记录自身的 `recordTimezone` 不能替代响应时区。第 115 轮窗口身份和第 111 轮未来点检查必须继续执行。不得修改 SQL、统计、客户端、响应形状、记录时区、持久化、计划算法、AI 或健康结论。

工作期间仓库并行完成并提交了第 116 轮现状文档基线 `4a44ec5`。该提交明确保留本轮四个未提交代码文件；本轮随后重新读取权威状态与第 116 轮档案，将自身顺延为第 117 轮，没有修改、重写或混入第 116 轮提交。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/insights/insights.service.ts`：新增无状态 `assertValidInsightTimezone`，动作与健康构造器在任何派生前解析响应时区；点的 `localDate` 继续由既有 `localDay(row.occurred_at, timezone)` 直接生成。
- `packages/contracts/src/insights.ts`：新增共享 `validateInsightPointLocalDates`，独立验证响应时区并逐点重建自然日；动作与健康 refinement 同时保留窗口身份和未来时刻门禁。
- `apps/api/src/insights/insights.service.test.ts`：两个现有投影用例都证明空点输入不能让 `Invalid/Timezone` 通过构造器。
- `packages/contracts/src/insights.test.ts`：动作契约证明普通错位和空序列无效时区路径；健康契约使用同一绝对时刻在纽约为前一日、在上海为当日的边界，证明响应时区优先于 `recordTimezone`。
- ADR-0111、架构、路线图、风险登记册、项目状态和本档案：同步本地日规则、验证范围、R-029 限制和第 118 轮候选。

本轮没有新增持久字段或第二份派生日期。它加强既有响应一致性，不改变正常生产结果。

## 3. 实现方法

### 先核对真实数据路径，再决定门禁位置

初始缺口描述把动作/健康点误认为由 SQL 生成 `local_date`。代码审计确认点查询只返回绝对 `occurred_at`，生产构造器已经用响应时区生成 `localDate`。因此本轮不修改 SQL，也不让数据库返回可与绝对时刻漂移的冗余日期；真正需要保护的是替代响应和空序列时区边界。

### 空序列也验证响应时区

此前 `localDay` 只在点映射时调用；零点响应不会触发。两个构造器现在首先用同一格式化路径解析参考时刻。该调用不保存结果，只证明响应时区可用，并发生在过滤、截断和首点派生之前。它不会把请求参考日混成点日期。

### 契约逐点重建而不是比较记录时区

共享校验器先用 `generatedAt` 验证响应时区；成功后逐点解析 `occurredAt` 并生成响应本地日。健康记录的 `recordTimezone` 描述原始记录上下文，而响应时区描述当前聚合/展示上下文，两者允许不同。纽约 8 月 4 日、上海 8 月 5 日的同一时刻用例防止未来实现误用来源时区。

### 多个一致性检查保持可组合

动作和健康顶层 refinement 依次执行固定窗口身份、本地日与未来发生时间检查。一种错误不覆盖另一种路径；本轮没有用本地日期替代绝对时间上界，因为自然日粒度不足以判断参考时刻之后的事实。

## 4. 验证证据

- 定向 Contracts/API strict 类型通过；2 个相关测试文件 16/16 通过。
- 完整 TypeScript strict 通过；完整 Vitest 为 89 个文件、461/461 项通过，完整集成为 20 个文件、66/66 项通过。
- 既有 H5/WeApp 产物再次通过 `myfitness-client-quality/v1`：H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节。
- 生产依赖为 0 个 critical/high，仍有 9 个已登记 moderate。
- 本轮没有客户端、路由、响应形状或视觉变化，因此没有重复全套截图写入；最近完整 Chromium 基线仍为第 113 轮 95/95。AI 代码和评估语料未变化，最近完整基线仍为服务 7/7、解释 12/12、食物照片 11/11。
- 中文门禁与迁移索引通过：`docs/` 共 257 份 Markdown，10 份活跃权威文档，第 090–117 轮和 ADR-0085–0111 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节验证一致：63,539 字节，SHA-256 为 `60284b07b177ee0df27046d8781b5a302fcf9d53926503d8511a4a453e9d5463`。

## 5. 发现的问题与经验

- 缺口描述不是实现事实。先核对类型、查询和构造器，避免为了“保持 SQL 一致”反而新增第二份可漂移日期。
- 派生字段最可靠的生产路径是从最小权威事实直接计算；共享契约仍需要独立重算，以防替代适配器绕开构造器。
- 空集合不能跳过元数据验证。响应时区即使暂时没有点，也会影响后续点、窗口语义和客户端标签。
- `recordTimezone` 与响应 `timezone` 表示不同上下文；用跨自然日边界用例才能证明实现没有碰巧在同一天通过。
- 本地日门禁不能替代绝对时间上界。两个规则分别保护自然日归类与参考时刻资格。
- 并行提交出现时，应重新读取最新状态、保留已提交工作并顺延迭代编号，不能覆盖、修改或把不同范围混成一个提交。

## 6. 全局状态、项目反思与下一步

本轮提高了动作与健康纵向观察的时间一致性：绝对事件不会被错误自然日移动到另一条时间线，来源时区也不会污染用户当前选择的观察时区。它没有把点序列解释成趋势、异常、正常范围或因果结论。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一处 Foundation Value 较高的缺口是点序列顺序。生产 SQL 按 `occurred_at DESC, created_at DESC, id DESC` 排列，但纯构造器仍信任输入顺序后截断 180 点并从首点派生身份/单位，共享 Schema 也未证明公开 `occurredAt` 非递增。错误顺序会改变时间线、首点语义和被截断证据。下一轮第 118 轮必须重新排序；当前候选是在全部最多 181 行输入上失败关闭升序断点，再由契约给出精确路径，同时允许无法由公开字段进一步排序的相同发生时刻。

本轮没有关闭 R-029：Node 本地验证不能证明目标 H5/微信平台的 IANA 数据完整性。风险登记册全表时效复核、真实身份/设备/保留/备份与 AI 专家语料仍保持开放。

## 7. 参考

- [第 116 轮档案](116-implemented-product-api-database-baseline.md)
- [项目状态](../PROJECT_STATUS.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考文档](../api/API_REFERENCE.md)
- [数据库设计文档](../architecture/DATABASE_DESIGN.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0111](../architecture/decisions/0111-insight-point-response-local-date.md)
