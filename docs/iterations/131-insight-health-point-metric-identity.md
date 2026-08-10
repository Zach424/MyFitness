# 第 131 轮：健康洞察逐点指标身份

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 D（Data Quality）与 F（Consistency Checking）。范围只有健康点从数据库来源行到公开响应的精确指标身份传播，以及该响应扩展对应的 OpenAPI 和双端构建验证。

验收标准固定为：真实 SQL 必须选择行自身的 `metric`；纯构造器必须在排序、未来过滤和 180 点截断前拒绝任一来源行指标错配，覆盖未来点与隐藏第 181 点；每个公开点必须携带来源指标，共享响应 Schema 必须独立要求它等于顶层指标并报告精确路径；真实 PostgreSQL 响应和 OpenAPI 必须包含该必填枚举；H5/WeApp 必须从新契约重新构建并保持预算。不得从单位或数值反推指标，不得修改数据库结构、窗口统计、分页、UI、历史值、计划、AI 或医疗解释。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/insights/insights.service.ts`：`HealthPointRow` 与 SELECT 新增 `metric`，公开映射复制来源身份；全量来源点在后续凭据、单位、换算、排序和过滤前核对请求指标。
- `apps/api/src/insights/insights.service.test.ts`：基础 181 点夹具携带体重身份，未来错配和隐藏第 181 点错配均失败关闭。
- `packages/contracts/src/insights.ts`：公开健康点新增必填 `metricCodeSchema`，顶层 Schema 逐点核对并定位 `series[index].metric`。
- `packages/contracts/src/insights.test.ts`：成功夹具显式携带体重身份，并证明同单位体系下的 `recovery.energy` 点不能进入体重投影。
- `apps/api/src/insights/health-insights.integration.spec.ts`：真实 PostgreSQL 响应断言逐点 `metric: body.weight`。
- `docs/api/openapi.json`：生成器新增逐点九值枚举和 required 条目，并同步源码既有的响应时区长度约束。
- H5/WeApp 生产目录：从本轮源码重新构建；客户端不消费新增字段，文件预算数值保持不变。
- ADR-0125、架构、已实现 PRD、接口参考、路线图、风险登记册、项目状态和本档案：同步来源身份、公开形状、验证证据、限制与第 132 轮候选。

本轮是公开响应的兼容性加字段，不改变现有客户端视觉或交互。

## 3. 实现方法

### 复制来源身份而非合成

SQL SELECT 返回真实行的 `metric`；`healthPoint` 复制 `row.metric`。若用请求参数填充公开点，即使数据适配器混入错误行，响应仍会伪装成正确身份，因此禁止这种合成。

### 来源与响应双层核对

纯构造器在所有原始行仍可见时逐行比较请求指标，保护未来点和隐藏第 181 点。公开 Schema 再比较每点与顶层 `metric`，保护替代响应构造器和机器契约消费者。单位与换算校验继续使用顶层精确指标，但不能代替身份校验。

### 最小兼容响应扩展

指标代码已经在顶层公开，逐点重复不会新增健康类别或来源内容。字段是必填而非可选，避免旧适配器静默省略身份；现有 UI 不读取它，类型检查和双端构建证明扩展没有引入客户端代码路径。

### 生成产物不手工修补

OpenAPI 通过应用生成器重建。除新增逐点指标外，生成器还恢复旧机器文档遗漏的 `timezone` 1–64 字约束；该约束早已存在于共享 Schema，因此作为生成漂移一起纳入，而不是手工删改 JSON。

## 4. 验证证据

- 定向单元为 contracts/API/client 3 个文件、18/18 项通过；定向真实 PostgreSQL 为 1 文件、1/1 项通过。
- 完整 TypeScript strict 通过；完整 Vitest 为 89 个文件、463/463 项通过，完整集成为 20 个文件、66/66 项通过。
- `pnpm --filter @myfitness/api openapi:generate` 通过；机器契约只增加逐点指标及同步既有响应时区长度约束。
- H5 与 WeApp 均从本轮源码完整构建通过。既有 Taro H5 入口建议警告、动态导入提示和 WeApp 缓存解析警告保持非阻塞。
- 重建产物通过 `myfitness-client-quality/v1`：H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节。
- 首次把完整集成、双端构建和审计并行执行时，编排单元在 124 秒上限终止且未返回可依赖结果；随后完整集成、H5、WeApp 和审计逐项重跑并全部通过，未提高测试阈值。
- 生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 本轮没有视觉或交互变化，因此没有重复全套截图写入；最近完整 Chromium 基线仍为第 113 轮 95/95。AI 代码和评估语料未变化，最近完整基线仍为服务 7/7、解释 12/12、食物照片 11/11。
- 中文门禁与迁移索引验证通过：`docs/` 共 285 份 Markdown，10 份活跃权威文档，第 090–131 轮和 ADR-0085–0125 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像写入并逐字节验证一致：64,214 字节，SHA-256 为 `e0e8fd057150e04ff133f2486fd5033bcdebea4911514696f1bf630bb5b7e00a`。

## 5. 发现的问题与经验

- SQL 的 WHERE 条件不等于纯构造器可观察的行身份；适配器边界必须把待验证字段带出来。
- 同单位、同范围和换算一致都不能证明指标相同，尤其多个主观恢复指标共用 `score_1_5`。
- 用请求参数回填响应身份会掩盖来源错误；审计字段必须复制来源证据。
- 公开点重复顶层枚举可以换取独立契约验证，且不增加新的敏感类别。
- 生成机器契约时发现的既有漂移应由生成器统一修复并透明记录，不应手工编辑生成 JSON。
- 并行化需要服从最慢任务的执行上限；没有明确退出码的运行不能算验证证据，必须降载重跑。

## 6. 全局状态、项目反思与下一步

本轮关闭了其他健康指标依靠相同单位和值语义混入单指标点序列的路径。它没有证明窗口聚合与点前缀来自同一份 90 日证据。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一处同类缺口位于 90 日窗口记录数、来源点截断收据、公开前缀和 `hasMore` 的关系。当前各局部门禁可以分别正确，但替代适配器仍可能返回“窗口有记录、点为空”或未满 180 点却少报记录。下一轮第 132 轮必须重新排序，当前最小候选是按真实 SQL 的同一资格边界绑定四者：记录数不超过 180 时来源/公开点数必须相等；超过 180 时来源必须恰好提供 181 行且公开 180 行；不从有限前缀臆测更多明细。

本轮未新增或关闭风险：逐点指标身份不证明窗口/点收据一致、记录真实性、设备准确、健康范围、趋势意义或真实用户理解。风险登记册全表时效复核、真实身份/设备/保留/备份与 AI 专家语料仍保持开放。

## 7. 参考

- [第 130 轮档案](130-insight-health-persisted-conversion-consistency.md)
- [项目状态](../PROJECT_STATUS.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考文档](../api/API_REFERENCE.md)
- [OpenAPI 机器契约](../api/openapi.json)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0125](../architecture/decisions/0125-insight-health-point-metric-identity.md)
