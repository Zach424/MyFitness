# ADR-0116：洞察原始时刻有效性

日期：2026-08-11

状态：已接受

## 背景

动作与健康洞察构造器接收 PostgreSQL/替代适配器提供的 JavaScript `Date`。排序比较和未来过滤此前直接使用 `getTime()`。对 `Invalid Date`，该方法返回 `NaN`：所有大小比较都为假，所以无效点既可绕过非递增检查，又会在 `<= at` 过滤中静默消失。无效参考 `at` 则在本地日格式化时抛错，被既有 catch 误报为时区无效。

公开共享 Schema 已对 `generatedAt` 和 `occurredAt` 字符串执行带偏移 datetime 验证，但它不能恢复构造阶段已被静默删除的来源点。

## 决策

- 两个构造器首先要求参考 `at.getTime()` 为有限数；失败抛出 `insight reference time must be a valid Date`。
- 参考时刻有效后才验证 IANA 时区，因此时间错误与时区错误保持可区分。
- 在顺序、UUID、未来过滤、合格上界、单位和首点派生前扫描全部原始点，任一 `occurred_at.getTime()` 非有限即抛出 `insight point rows must have valid occurred_at values`。
- 扫描覆盖未来位置和隐藏第 181 点；不删除、排序或替换无效值。
- 保持 SQL、公开 Schema、分页、响应形状、窗口统计、客户端、持久化、计划、AI 和健康解释不变。

## 影响

无效原始点不再伪装成缺失证据，也不能改变首点、点数、截断收据或健康单位检查。无效参考时刻获得独立故障，不再误导为时区配置问题。

本决策证明构造输入可表示为有限时刻，不证明记录时间真实、时区选择正确、数据库排序完整或趋势具有统计/医疗意义。窗口原始行身份与数值质量仍需独立门禁。

## 参考

- [第 122 轮档案](../../iterations/122-insight-raw-time-validity.md)
- [ADR-0115](0115-insight-truncation-receipt-consistency.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
