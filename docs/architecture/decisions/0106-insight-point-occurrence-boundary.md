# ADR-0106：健康与动作洞察点不得晚于参考时刻

日期：2026-08-10

状态：已接受

## 背景

健康与动作长期洞察都返回 `generatedAt`、7/30/90 日窗口以及最多 180 个带 `occurredAt` 的来源点。两类窗口查询与点查询已经在 PostgreSQL 使用 `occurred_at <= at` 或 `started_at <= at`，所以当前数据库路径不会读到参考时刻后的事实。

但是，公开 `buildHealthInsight` 与 `buildExerciseInsight` 直接对传入点行执行 180 条截断和映射。测试夹具、替代适配器或未来抽取的数据源若传入未来点，该点可能成为首点，改变动作身份或健康规范单位，并占用序列上限、影响 `hasMore`。共享 `healthInsightSchema` 与 `exerciseInsightSchema` 只验证单点格式，不验证点与 `generatedAt` 的关系。

窗口行只有聚合值，没有每条来源的发生时间。有限点序列也可能因 180 条上限而不能重建完整窗口，所以本轮不能用点序列反推或重算窗口；窗口仍由已正确的 SQL 负责。

## 决策

- 两个纯构造器先按 `row.occurred_at <= at` 生成合格点集合，再从该集合执行 180 点截断、点映射、首点身份/规范单位和 `hasMore` 推导。
- 两个共享顶层 Schema 使用同一跨字段校验器。任一点 `occurredAt > generatedAt` 都在 `series[index].occurredAt` 路径产生自定义 Issue，并使响应失败关闭。
- 单元测试为动作和健康各向同一输入头部插入一个未来点。早期参考时刻必须忽略该点；推进参考时刻后，该点必须成为合法首点。契约测试分别证明伪造的未来点被精确路径拒绝。
- 不修改已经正确的 SQL、窗口聚合、查询参数、路由、客户端、迁移、AI 或计划规则。`at` 继续表示发生时间截止，不是事务时间或旧修订重建。

## 影响

未来点不能再通过非数据库调用路径提前改变动作名称、动作快照身份、健康规范单位、序列内容或续页提示。共享响应边界也不再接受此类污染，即使上游绕过纯构造器。

过滤发生在截断前，因此未来点不会消耗 180 条合格证据配额；`hasMore` 只描述调用方实际提供的合格点集合。生产 SQL 先完成相同时间过滤并最多返回 181 条，因此现有端点语义保持不变。

本决策不证明窗口聚合可以从响应独立审计，也不验证 `localDate` 是否与响应时区中的 `occurredAt` 一致。窗口仍依赖参数化 SQL；本地日期一致性和真实平台 IANA 数据仍是后续独立门禁。

## 参考

- [第 111 轮档案](../../iterations/111-insight-point-occurrence-boundary.md)
- [ADR-0105](0105-dashboard-occurrence-time-boundary.md)
- [架构基线](../ARCHITECTURE.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
