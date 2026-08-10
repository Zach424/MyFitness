# ADR-0113：洞察点聚合身份唯一性

日期：2026-08-11

状态：已接受

## 背景

动作洞察 SQL 按训练 `w.id` 聚合，健康洞察从当前已确认记录按 `id` 返回，因此正常查询中的每个点都对应唯一聚合 UUID。服务最多读取 181 行，公开前 180 点并用额外一行决定 `hasMore`。

纯构造器此前不验证 UUID 唯一性。替代适配器或错误夹具可重复 `workout_id`/`record_id`，包括只在第 181 行重复；共享 Schema 也允许公开 `workoutId`/`recordId` 重复。一条事实由此可被绘制、计数或解释为多条纵向证据。

## 决策

- 通用 `assertUniqueInsightPointRowIds` 在未来过滤、180 点截断、首点摘要和 `hasMore` 派生前扫描全部输入 UUID。
- 首个重复输入使构造器抛出 `insight point rows must have unique aggregate ids`；不得静默去重、保留首项或保留末项。
- 共享 `validateUniqueInsightPointIds` 分别读取公开 `workoutId`/`recordId`，在第二个重复项的 `series[index].workoutId` 或 `series[index].recordId` 报告 `insight points must have unique aggregate identities`。
- 保持 SQL、排序、窗口统计、响应形状、客户端、持久化、计划、AI 和健康解释不变；既有时区、本地日、顺序和未来点门禁继续组合执行。

## 影响

服务端隐藏的第 181 行和公开序列现在都不能重复使用同一聚合身份。错误数据会在边界暴露，不会通过静默去重制造无法解释的点数、截断或 `hasMore`。

本决策证明响应内身份唯一，不证明来源系统真实、证据集合完整、一个聚合内事实无误或统计具有因果/临床意义。顶层身份/单位摘要与首点证据的关系仍需独立门禁。

## 参考

- [第 119 轮档案](../../iterations/119-insight-point-aggregate-identity-uniqueness.md)
- [ADR-0112](0112-insight-point-descending-order.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
