# ADR-0111：洞察点响应本地日一致性

日期：2026-08-10

状态：已接受

## 背景

动作与健康洞察点公开绝对 `occurredAt`、响应 `timezone` 和派生 `localDate`。生产 SQL 只返回绝对发生时刻；纯构造器已经直接用 `occurredAt + response timezone` 生成本地日，因此无需也不应新增一份可漂移的 SQL 日期字段。

共享 Schema 此前只检查 `localDate` 的字符串格式。替代适配器、错误夹具或未来模块抽取仍可把正确绝对时刻配到错误自然日。健康点还保留记录写入时的 `recordTimezone`；它是来源凭据，不能替代用于当前洞察分组和展示的响应时区。点序列为空时，构造器此前不会调用本地日格式化，无效响应时区也可能延迟到契约之外。

## 决策

- 动作与健康纯构造器在窗口、180 点截断、首点身份/规范单位及 `hasMore` 派生前，用参考时刻解析响应时区；失败统一抛出 `insight timezone must be a valid IANA timezone`，空点序列也不例外。
- 共享 `validateInsightPointLocalDates` 先独立证明响应时区可解析，再逐点以 `occurredAt + response timezone` 重建本地日。
- 无效响应时区在 `timezone` 报告 `timezone must resolve insight point local dates`；错位点在 `series[index].localDate` 报告 `insight point localDate must match occurredAt in the response timezone`。
- 健康点的 `recordTimezone` 继续作为记录来源凭据，不参与响应 `localDate` 的派生。
- 固定 7/30/90 窗口身份与 `occurredAt <= generatedAt` 检查继续组合执行；不改变 SQL、窗口统计、客户端、响应形状、原始记录时区、持久化、计划、AI 或健康解释。

## 影响

生产构造器、共享契约和替代适配器现在对点级自然日使用同一可解释规则。错误日期不能再进入纵向图表或变化起点解释，无点响应也不能携带不可解析的时区。

本决策证明响应内时间字段一致，不证明目标 H5/微信运行时具备完整、正确的 IANA 数据，也不重建记录写入时的民用时间语义。R-029 继续开放。

## 参考

- [第 117 轮档案](../../iterations/117-insight-point-response-local-date.md)
- [ADR-0110](0110-fixed-insight-window-identity.md)
- [架构基线](../ARCHITECTURE.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
