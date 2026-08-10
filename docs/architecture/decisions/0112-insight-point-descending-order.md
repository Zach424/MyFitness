# ADR-0112：洞察点发生时刻非递增

日期：2026-08-11

状态：已接受

## 背景

动作和健康洞察的 PostgreSQL 查询已经按 `occurred_at DESC, created_at DESC, id DESC` 取得最多 181 行。第 181 行只用于 `hasMore`，前 180 行形成公开序列；动作首点还提供当前展示身份，健康首点提供顶层规范单位。

纯构造器此前信任传入数组顺序，替代适配器或错误夹具可把旧点置于首位，或把更新点放到第 181 行后被截断。共享 Schema 也只验证单点时间边界，没有证明公开 `series` 最新优先。错误顺序会改变图表、首点语义和变化起点。

## 决策

- 共享服务端 `assertInsightPointRowOrder` 在未来过滤、180 点截断、首点身份/单位和 `hasMore` 派生前，验证全部输入行的 `occurred_at` 非递增。
- 首个升序断点使构造器抛出 `insight point rows must be ordered by occurred_at descending`；不得静默排序，因为那会掩盖上游查询或适配器错误。
- 共享契约逐点比较公开 `occurredAt`，在较新的后项 `series[index].occurredAt` 报告 `insight points must be ordered by occurredAt descending`。
- 相同发生时刻允许。数据库可用 `created_at` 和 UUID 稳定排序，但公开响应没有创建时刻，契约不声称无法独立证明的完整次序。
- 保持 SQL、窗口统计、响应形状、客户端、持久化、计划、AI 和健康解释不变；既有时区、本地日、固定窗口和未来点检查继续组合执行。

## 影响

服务端隐藏的第 181 行和公开前 180 点现在共享最新优先的可证明时间边界。错误输入不能再通过截断隐藏更新点，替代响应也不能发布升序时间线。

本决策只证明绝对发生时刻非递增，不证明相同时刻的公开全排序、点身份唯一性、趋势、因果或临床意义。相同发生时刻仍由数据库内部稳定次序处理，下一致性层应单独保护聚合身份。

## 参考

- [第 118 轮档案](../../iterations/118-insight-point-descending-order.md)
- [ADR-0111](0111-insight-point-response-local-date.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
