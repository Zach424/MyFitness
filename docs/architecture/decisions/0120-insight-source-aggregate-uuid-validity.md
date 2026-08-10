# ADR-0120：洞察来源聚合 UUID 有效性

日期：2026-08-11

状态：已接受

## 背景

动作/健康洞察点的 `workout_id` 与 `record_id` 由 PostgreSQL UUID 列提供，但纯构造器此前只依赖 TypeScript `string` 声明和集合唯一性。无效字符串可以参与排序后的去重并进入响应，直到外层共享 Schema 或客户端解析才失败；被截断的第 181 点甚至不会出现在公开 Schema 中。

共享点 Schema 已用 `uuid()` 验证公开 `workoutId`/`recordId`，但无法证明构造前的完整来源集合身份有效。

## 决策

- 两个纯构造器共用来源聚合 UUID 校验，接受十六进制标准连字符格式、UUID 版本 1–8 与 RFC 标准变体。
- 校验扫描全部原始点，包括未来位置与隐藏第 181 点；任一无效 ID 抛出 `insight point rows must have valid aggregate UUIDs`。
- UUID 格式检查发生在点时刻、数值和关系门禁之后，在发生顺序与唯一性检查之前；格式错误与重复错误保持可区分。
- 不纠正大小写、不生成替代 ID、不查询其他聚合，也不修改共享 Schema 的既有 `uuid()` 二次防御。
- 保持 SQL、公开响应形状、分页、客户端、持久化、计划、AI 和健康解释不变。

## 影响

无效聚合标识不能进入顺序/唯一性语义，也不能通过截断逃逸。正常 PostgreSQL UUID 保持兼容，公开 Schema 继续保护传输边界。

本决策证明 ID 具有约定 UUID 表示，不证明它真实存在、属于当前用户、对应正确聚合、来源快照字段有效或记录可信；所有权仍由 SQL 查询作用域保证。

## 参考

- [第 126 轮档案](../../iterations/126-insight-source-aggregate-uuid-validity.md)
- [ADR-0119](0119-insight-aggregate-relationships.md)
- [架构基线](../ARCHITECTURE.md)
- [接口参考](../../api/API_REFERENCE.md)
