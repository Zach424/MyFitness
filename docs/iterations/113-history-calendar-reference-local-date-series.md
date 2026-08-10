# 第 113 轮：历史日历参考本地日期序列一致性

日期：2026-08-10

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 F（Consistency Checking）。范围只有跨领域历史日历的 28 日本地日期和范围标签。输入必须恰好覆盖 `generatedAt` 在请求 `timezone` 中的本地日以及此前 27 个自然日；顺序、日期和 `startDate`/`endDate` 必须全部一致。

验收标准固定为失败关闭：纯 `buildHistoryCalendar` 在映射计数前拒绝错序、重复、未来、缺日和整体偏移，不自动排序、去重或补行；共享 `historyCalendarSchema` 独立定位首个日期错位，并校验范围两端。同一输入在较早参考日失败、推进到末日后通过。不得修改已正确 SQL、路由、客户端、持久化、90 日回填门禁、零行为、打卡或依从性语义。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/insights/insights.service.ts`：历史日历构造器复用现有参考本地日期序列辅助函数，在单日映射前校验精确 28 日范围。
- `packages/contracts/src/insights.ts`：把本地日期辅助函数提升为历史与营养契约共享实现；历史 Schema 重建参考范围、定位首个错位并验证首尾标签，营养既有语义不变。
- `apps/api/src/insights/insights.service.test.ts`：现有历史投影用例新增较早参考时刻、重复/缺日和反序输入失败证明。
- `packages/contracts/src/insights.test.ts`：现有历史契约用例新增较早参考日与中间重复/缺日的精确 Issue 路径证明。
- ADR-0108、架构、路线图、风险登记册、项目状态和本档案：同步失败关闭语义、验证证据、R-029 限制和下一轮 Dashboard 本地日候选。

本轮没有视觉变化。正常 PostgreSQL 仍返回相同 28 日范围与计数；95 项浏览器测试产生的非功能性截图改写已恢复为仓库基线。

## 3. 实现方法

### 在计数映射前验证唯一日期范围

服务端复用第 112 轮加入的日期序列函数：先用 IANA 时区格式化把 `at` 映射为末日本地日期，再用 UTC 日历算术生成从末日前 27 日到末日的有序数组。输入必须恰好有 28 行，且每个 `local_date` 与同索引预期日期相等；任一不匹配都会抛出 `history calendar rows must cover the reference local-date range`。

校验发生在 `historyCalendarDay` 之前，因此缺行不能被映射成零计数，错序也不能通过随后复制首尾标签获得表面自洽。只有权威来源返回完整序列，才会继续派生 `hasRecords` 和范围两端。

### 让响应契约独立重建参考范围

共享契约从 `generatedAt + timezone` 独立生成连续 28 日预期数组。它只为首个不匹配日期添加 `series[index].localDate` Issue，避免整体偏移产生大量重复错误；`startDate` 和 `endDate` 还必须分别等于预期首尾，而不是只等于可能已经错误的数组两端。无效时区在 `timezone` 路径失败。

### 保留数据库和产品语义

PostgreSQL 查询已经用 `generate_series` 正确生成 28 日并以 `occurred_at/started_at <= at` 排除未来事实，因此本轮不修改 SQL。空白日、计数和 `hasRecords` 仍来自数据库；客户端的未知/过期读取权限、90 日回填日期门禁以及“不评分/不判断依从性”文案均不变。

## 4. 验证证据

- 定向 Contracts/API strict 类型通过；2 个相关单元文件 16/16 通过；历史日历真实 PostgreSQL 集成 1/1 通过。
- 完整 TypeScript strict 通过；完整 Vitest 为 89 个文件、461/461 项通过，完整集成为 20 个文件、66/66 项通过。
- 使用隔离 3114 API 端口与重建 H5 的完整 Chromium 95/95 通过；随后恢复默认 API 来源和仓库截图基线。
- Python AI 服务 7/7、AI 解释评估 12/12、食物照片评估 11/11 通过。
- H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节，均与第 112 轮一致并通过原预算。
- 双端禁止运行时标记扫描通过；生产依赖为 0 个 critical/high，仍有 9 个已登记 moderate。
- 中文门禁与迁移索引通过：`docs/` 共 247 份 Markdown，第 090–113 轮和 ADR-0085–0108 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节验证：`62417` 字节，SHA-256 为 `25238ac50ba10e86a8488864efc640debe811c9d250585491de57e01a1b17c4c`。

## 5. 发现的问题与经验

- “长度为 28 且严格升序”仍不能证明日期连续或锚定参考时刻；每个日期都必须由同一参考日生成并逐索引比较。
- 范围标签等于数组首尾只能证明内部自洽，不能证明数组来源正确；契约必须把两端直接绑定到 `generatedAt + timezone`。
- 对内部缺行自动补空白日会把来源故障伪装成“确认零记录”。只有 SQL 明确生成的零计数日才具有产品语义。
- 纯构造器和最终契约需要独立防线：前者尽早暴露来源错误，后者保护所有替代实现和最终 HTTP 响应。
- 自然日算术应复用同一已验证实现；历史与营养若各自实现日期推进，容易在 DST 或边界规则上再次分叉。
- 浏览器测试的截图写入不是视觉变更证据；无视觉范围的轮次应恢复测试副作用，并只保留明确验收的文件。

## 6. 全局状态、项目反思与下一步

本轮把跨领域历史日历从“28 行且升序的数组”提升为可证明的参考本地时间轴，避免错误日期驱动历史解释或回填导航。它没有增加评分、连续打卡或依从性结论，也没有把缺失来源降级成零行为。

全局复查显示，`buildDashboard` 已正确从 `at + timezone` 计算 `today.date`，但共享 `dashboardSchema` 只验证日期格式，未独立证明响应时区可解析或 `today.date` 等于 `generatedAt` 的本地日。客户端会用该日期显示首页并选择当前周计划，替代适配器或错误夹具仍可能把偏移日期发布为有效响应。下一轮第 114 轮应重新按全局缺口排序；当前最高价值候选是继续归类 F（Consistency Checking），只补 Dashboard 参考本地日契约，不修改已正确构造器/SQL、计划选择、客户端或持久化。固定 7/30/90 窗口身份作为随后独立候选。

本轮没有关闭 R-029：服务器端 IANA 映射和确定性自然日门禁不能证明真实 H5/微信平台时区数据。R-030/R-032 与双时态历史同样保持开放。

## 7. 参考

- [第 112 轮档案](112-nutrition-reference-local-date-series.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0108](../architecture/decisions/0108-history-calendar-reference-local-date-series.md)
