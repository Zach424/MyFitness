# ADR-0125：健康洞察逐点指标身份

日期：2026-08-11

状态：已接受

## 背景

健康洞察已按请求路径中的精确指标查询，并验证每个点的单位身份与数值换算。但 `HealthPointRow` 只携带记录 UUID、修订、时间、单位、数值和来源；纯构造器无法观察数据库行自身的 `metric`。替代数据适配器因此可以把同为 `score_1_5` 且换算完全合法的精力、压力或酸痛记录混入一个投影。

只在 API 构造器中补充来源行指标可以保护该实现，却无法让公开响应 Schema 独立证明每个点属于顶层指标。逐点重复一个已经公开的非敏感指标枚举，成本小于依赖单位或数值猜测身份，也不会暴露新的健康内容。

## 决策

- 健康点 SQL 显式选择记录行的 `metric`，`HealthPointRow` 使用共享 `MetricCode` 类型携带该值。
- 纯构造器在来源 UUID 数值校验之后、来源凭据/单位/换算、排序、未来过滤和截断之前，要求全部原始点的 `metric` 精确等于请求指标。未来点和隐藏第 181 点同样受检。
- `HealthInsightPoint` 新增必填 `metric`；映射只复制来源行身份，不从单位、数值或顶层参数合成该字段。
- 共享 `healthInsightSchema` 逐点要求 `point.metric === insight.metric`，错配定位到 `series[index].metric`。后续单位和换算仍按顶层精确指标验证，避免错误行通过同单位巧合。
- 真实 PostgreSQL 集成测试确认响应公开行指标；OpenAPI 机器契约重新生成并把该字段标记为九值枚举和必填项。
- OpenAPI 生成器还恢复了源码已经要求、但旧机器文档遗漏的响应 `timezone` 1–64 字长度；不手工编辑生成产物。
- 不修改数据库结构、查询资格、统计、分页、客户端展示、历史记录、计划、AI 或医疗解释。

## 影响

健康点身份从数据库行连续传播到公开响应。真实 SQL 过滤、纯构造器和响应契约现在各自有可执行证据；同单位的其他指标不能依靠数值和单位巧合进入投影。

新增字段是兼容性的响应扩展。现有 H5/WeApp 不读取它，但已经从新契约重新构建并通过原产物预算；机器契约消费者可以据此审计逐点身份。

本决策不证明 90 日窗口记录数与点截断收据一致、记录真实、设备准确、健康范围、趋势意义或用户理解。

## 参考

- [第 131 轮档案](../../iterations/131-insight-health-point-metric-identity.md)
- [ADR-0124](0124-insight-health-persisted-conversion-consistency.md)
- [ADR-0039](0039-exact-metric-health-observation.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
- [OpenAPI 机器契约](../../api/openapi.json)
