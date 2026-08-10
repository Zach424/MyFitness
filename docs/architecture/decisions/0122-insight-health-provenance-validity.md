# ADR-0122：健康洞察来源凭据有效性

日期：2026-08-11

状态：已接受

## 背景

健康洞察保留规范/展示单位、记录时区和来源元数据，以便用户区分统计单位、原始输入和记录来源。生产 SQL 读取受数据库约束的 confirmed-only 行，但纯构造器此前相信 TypeScript 行类型；替代适配器可注入未知单位/来源、无效元数据容器或字段、不可解析时区，甚至把 `ai_estimate` 伪装为已确认纵向事实。

公开点 Schema 已覆盖多数表示字段，却只能看到未来过滤与 180 点截断后的响应。它此前也只约束记录时区长度，并允许通用记录来源中的 `ai_estimate`。

## 决策

- API 构造器先把每条原始来源的 `source_kind` 与 `source_metadata` 交给共享 `recordSourceSchema`，再把完整映射点交给 `healthInsightPointSchema`。
- 检查扫描全部原始点，在发生顺序、未来过滤、181 行收据和 180 点截断前执行；任一失败抛出 `health insight point rows must have valid provenance snapshots`。
- 原始元数据必须是严格对象；空白、超长、未知键、数组和空值容器失败，不在映射时静默折叠为空来源。
- 公开健康点 Schema 要求 `recordTimezone` 可由 IANA 时区数据解析，并把 `ai_estimate` 排除在当前 confirmed-only 投影之外。未来如增加显式 AI 确认流程，必须另行决定响应证据语义。
- 单位与来源类型继续使用共享枚举。合法负值仍可表示；本轮不验证指标专属单位、不重跑数值范围、不改写展示值。
- `recordTimezone` 只作来源凭据；响应 `localDate` 继续由 `occurredAt + response timezone` 派生。
- 保持 SQL、响应形状、分页、客户端、持久化、计划、AI 提供方和健康解释不变。

## 影响

无效来源凭据不能通过未来过滤或截断逃逸，原始来源容器和公开点分别受到共享契约保护。confirmed-only 洞察不会把 AI 候选来源发布为已确认事实，记录时区也不会篡改响应本地日。

本决策只证明来源表示符合当前契约，不证明指标与单位语义匹配、数值换算正确、设备或导入来源真实、IANA 数据在所有终端完整、记录健康或趋势具有临床意义。

## 参考

- [第 128 轮档案](../../iterations/128-insight-health-provenance-validity.md)
- [ADR-0121](0121-insight-exercise-snapshot-validity.md)
- [ADR-0039](0039-exact-metric-health-observation.md)
- [ADR-0111](0111-insight-point-response-local-date.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
