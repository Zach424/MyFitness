# ADR-0109：Dashboard 日期绑定参考时刻本地日

日期：2026-08-10

状态：已接受

## 背景

Dashboard 返回 `generatedAt`、请求 `timezone` 和 `today.date`。生产 `buildDashboard` 已使用 IANA 时区把参考时刻映射为本地日期，客户端会用该日期显示首页、关联教练工作台证据并选择包含当天的当前周计划。

共享 `dashboardSchema` 此前只要求 `today.date` 符合 `YYYY-MM-DD`，`timezone` 也只是任意字符串。一个字段格式正确但比参考本地日早一天或晚一天的响应仍可通过；无效时区也可进入最终 HTTP 响应。替代适配器、错误夹具或未来模块抽取因此可能让客户端选择错误周范围，而其他证据仍表面自洽。

## 决策

- `dashboardSchema` 把响应 `timezone` 收紧为与查询相同的非空、有界字符串，并在顶层 refinement 中用 IANA 格式化解析 `generatedAt` 的本地日期。
- 无效时区在 `timezone` 路径失败；可解析时区下，`today.date` 必须精确等于该参考本地日，否则在 `today.date` 路径失败。
- 现有未来证据、个人状态账本和来源一致性检查继续独立执行；日期错误不降级成客户端修正或服务器默认时区。
- 保持生产构造器、SQL、端点、查询参数、响应形状、客户端时区探测、周计划选择、持久化和 AI 行为不变。

## 影响

跨 UTC 日界但尚未跨请求本地日界的时刻，或已经进入请求时区次日的时刻，都必须得到对应的唯一 `today.date`。格式正确的偏移日期和无效时区不能再驱动首页与计划选择。

本决策只保护服务器最终响应一致性，不证明浏览器或微信设备的 `Intl` 时区数据库、客户端探测结果和服务器一致。R-029 继续开放；代表性时区与真实设备验证仍是封闭测试门禁。

## 参考

- [第 114 轮档案](../../iterations/114-dashboard-reference-local-date.md)
- [ADR-0108](0108-history-calendar-reference-local-date-series.md)
- [架构基线](../ARCHITECTURE.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
