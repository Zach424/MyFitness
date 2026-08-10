# 第 138 轮：健康未截断窗口与点统计收据

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 F（Consistency Checking）。范围只包含健康 90 日未截断窗口的 minimum、maximum、average 与完整规范值点集合之间的收据。

验收标准固定为：`recordCount <= 180` 且点数完整时，来源三项统计必须与全部 `canonical_value` 复算结果一致；公开三项统计必须落在四位小数舍入与浮点运算可解释的有界误差内；`recordCount > 180` 时必须跳过完整统计对账；真实 PostgreSQL 响应直接证明 90 日窗口三项统计等于全部公开规范值集合。不得使用任意宽松容差、从截断前缀重算窗口、自动改值、增加正值/范围/趋势/医疗规则，或修改 SQL、响应形状、客户端、历史记录、计划和 AI。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/insights/insights.service.ts`：新增来源完整点统计收据，在既有点数收据之后复算 minimum、maximum 与 average。
- `apps/api/src/insights/insights.service.test.ts`：补齐精确两点集合、三类来源错配、合法负值和未截断 180 点平均夹具；181 点主夹具继续证明截断跳过。
- `packages/contracts/src/insights.ts`：新增公开未截断统计收据，对四位窗口统计使用半末位单位与浮点误差的组合上界。
- `packages/contracts/src/insights.test.ts`：覆盖三类精确响应字段、四位舍入合法边界、合法负值和完整 180 点截断前缀。
- `apps/api/src/insights/health-insights.integration.spec.ts`：真实 PostgreSQL 响应直接从全部公开规范值复算 minimum、maximum 与 average。
- ADR-0132、架构、已实现 PRD、接口参考、路线图、风险登记册、项目状态和本档案：同步完整性前提、精度公式、截断边界与第 139 轮候选。

本轮没有改变合法响应形状、查询或客户端行为。

## 3. 实现方法

### 完整性先于统计收据

第 132 轮已经证明 `recordCount <= 180` 时来源/响应点数精确等于完整记录计数。本轮收据在该门禁之后运行；一旦记录数超过 180，立即退出，不把最新前缀冒充完整 90 日集合。零记录继续由既有空窗口关系验证，不产生 `Math.min`/`Math.max` 的空集合伪值。

### 来源精度

数据库规范值为 `NUMERIC(14,4)`，MIN/MAX/AVG 与点查询共享同一 confirmed/current/metric/reference/90-day 集合。来源边界把十进制文本转成 `Number` 后复算。允许误差只由机器精度、窗口统计、点绝对值和、复算值幅度与点数决定，并乘四保留运算余量；明显业务错配仍失败。

### 响应四位量化边界

公开点已经是四位持久化规范值；只有窗口统计在公开时再次舍入到四位。因此响应上界只增加一个 0.00005 半末位单位，而不是动作逐点显示聚合所需的 `(N+1)` 个量化单位；之后再叠加同形式浮点误差。

### 精确诊断而不修复

来源冲突使用领域级完整统计收据错误。共享 Schema 把 minimum、maximum 与 average 分别定位到 90 日 `statistics` 字段。两层都不重写窗口或点，也不把负值解释成健康异常。

## 4. 验证证据

- 定向 contracts/API 共 2 文件、17/17 项通过；contracts 与 API strict 类型检查通过。
- 定向真实 PostgreSQL 共 1 文件、1/1 项通过；完整集成共 20 文件、66/66 项通过。
- 完整 Vitest 共 89 个文件、464/464 项通过。首次并发全量运行使原有大型健康投影测试超过 5 秒；本轮场景拆为独立测试后复跑通过，没有放宽测试超时。
- 第 131 轮重建的 H5/WeApp 产物继续通过 `myfitness-client-quality/v1`：H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节。
- 生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 本轮没有客户端、路由、响应形状或视觉变化，因此没有重复构建与全套截图写入；最近完整 Chromium 基线仍为第 113 轮 95/95。AI 代码和评估语料未变化，最近完整基线仍为服务 7/7、解释 12/12、食物照片 11/11。
- 中文门禁与迁移索引验证通过：`docs/` 共 299 份 Markdown，十份活跃权威文档、一份治理规范、17 份待迁移专题、174 份待迁移历史，第 090–138 轮和 ADR-0085–0132 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节验证一致：63,681 字节，SHA-256 为 `7b78838b54253a57eb24caa019ab200f741cd0c7dd35722870a8307910b73c88`。

## 5. 发现的问题与经验

- 完整统计收据必须建立在完整点数收据之后；有限前缀无法支持极值或平均结论。
- 健康窗口公开精度实际为四位，不应沿用动作测量或旧候选描述中的两位假设。
- 窗口只量化一次时，半末位单位足够；不应复制动作逐点舍入再求和的 `(N+1)` 上界。
- 绝对值和能让浮点误差边界覆盖正负抵消，而不增加业务范围判断。
- 完整性测试应拆成有界场景；遇到并发超时应减小单测试职责，而不是直接放宽超时。
- PostgreSQL 响应的直接复算断言比仅证明 Schema 成功更清楚。

## 6. 全局状态、项目反思与下一步

本轮关闭了未截断健康窗口三项统计与完整规范值点集合之间的矛盾，同时保持截断边界诚实。它没有核对窗口 `recordedDays` 与全部点按响应时区推导的去重本地日数量。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，第 139 轮应重新排序；当前最小关键候选是健康未截断窗口与点记录日收据。下一轮需先核对 SQL 的本地日期表达式、来源 `localDay` 与响应 Schema 日期规则，再在 `recordCount <= 180` 时比较去重本地日数量，超过 180 时跳过。必须覆盖同日多点和夏令时边界，不增加趋势或医疗解释。

本轮未新增或关闭风险：统计收据不证明记录日一致、来源真实性、设备准确性、健康范围、趋势意义、医疗结论或真实用户理解。风险登记册全表时效复核、真实身份/设备/保留/备份与 AI 专家语料仍保持开放。

## 7. 参考

- [第 137 轮档案](137-insight-exercise-complete-point-aggregate-receipt.md)
- [项目状态](../PROJECT_STATUS.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考文档](../api/API_REFERENCE.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0132](../architecture/decisions/0132-insight-health-complete-point-statistics-receipt.md)
