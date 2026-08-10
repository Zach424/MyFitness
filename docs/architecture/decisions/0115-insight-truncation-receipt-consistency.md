# ADR-0115：洞察截断收据一致性

日期：2026-08-11

状态：已接受

## 背景

动作与健康洞察 SQL 都按确定性降序精确 `LIMIT 181`。构造器公开前 180 点，并用额外一个合格点将 `hasMore` 设为真；这不是分页游标，而是“当前响应发生过截断”的有界收据。

纯构造器此前会接受任意数量的替代输入并静默切到 180 点，因此 182 行与 181 行产生同样响应，无法发现替代查询绕过 SQL 上界。共享 Schema 也允许只有少量公开点却声明 `hasMore: true`，使客户端收到没有满公开前缀支持的截断声明。

## 决策

- 两个构造器继续先验证全部原始输入的顺序与 UUID 唯一性，再过滤晚于参考时刻的点；过滤后的合格集合最多 181 行。
- 第 182 个合格输入使构造器抛出 `insight point rows cannot exceed the 181-row truncation receipt`，不静默截断或改写点数。
- 共享 `validateInsightTruncationReceipt` 要求 `hasMore: true` 时公开 `series` 恰好有 180 点，错误定位到 `hasMore`。
- `hasMore: false + 180 点` 保持合法：公开响应没有第 181 点，不能仅从长度证明来源完整或不完整。
- 原始集合可以包含未来点和 181 个当前点；上界只对未来过滤后的合格证据执行。
- 保持 SQL、分页、响应形状、客户端、窗口统计、持久化、计划、AI 和健康解释不变。

## 影响

替代查询不能再把超过一个隐藏点压成同一收据，公开响应也不能在不足 180 点时声称存在截断。正常 SQL 响应和 `hasMore` 派生保持不变。

本决策证明响应内截断声明具有最小长度支持，不证明数据库查询完整、未公开点恰好只有一个、来源数据真实或后续时间线具有统计意义。原始 `Date` 值是否有效仍需独立门禁。

## 参考

- [第 121 轮档案](../../iterations/121-insight-truncation-receipt-consistency.md)
- [ADR-0114](0114-insight-leading-summary-consistency.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
