# ADR-0124：健康洞察持久化换算一致性

日期：2026-08-11

状态：已接受

## 背景

ADR-0123 已把九个指标的规范单位和允许展示单位提升为 contracts/domain 共用身份，但单位合法不证明数值互相对应。只读替代适配器仍可把 `160 lb` 与 `160 kg` 组合成一个单位身份合法的健康点。

健康主表和不可变修订表都把 `canonical_value` 与 `display_value` 保存为 `NUMERIC(14,4)`。写入归一化在数据库舍入前从原展示值计算四位规范值，因此只读校验不能要求对持久化展示值重新换算后逐位相等；尤其 `hour → minute` 会把展示列半个量化单位放大 60 倍。校验需要吸收可解释的持久化误差，但不能用宽泛百分比掩盖真实错配。

## 决策

- 在无依赖健康记录常量中统一定义九个单位的规范单位和确定性线性换算因子；领域归一化复用该函数，原有指标范围、整数判断和规范值四位舍入保持不变。
- 共享 `measurementPersistenceDecimalPlaces = 4`。令量化单位 `q = 10^-4`：允许的规范值误差为 `q / 2`；非规范展示单位再加入 `abs(factor) * q / 2` 的展示列舍入误差。展示单位已经是规范单位时，两列由同一原值写入，不重复加入展示舍入误差。
- 比较 `canonicalValue` 与 `displayValue * factor` 时只额外加入 `4 * Number.EPSILON * max(1, abs(actual), abs(expected))` 的浮点运算余量，不使用固定百分比或健康范围。
- API 健康洞察构造器在数值、来源和指标—单位关系通过后，对排序、未来过滤和 180 点截断前的全部原始点执行换算检查。未来点和隐藏第 181 点同样失败关闭。
- 共享健康响应 Schema 在单位关系成立后逐点独立执行相同纯检查，并把错配定位到对应 `series[index].canonicalValue`，避免单位错误产生级联换算错误。
- 迁移漂移测试同时锁定 `health_records` 与 `health_record_revisions` 的规范/展示值列为 `NUMERIC(14,4)`，使容差常量与真实持久化精度共同演进。
- 不修改 SQL、响应形状、分页、客户端、历史值或数据库行；不自动修复错配，不执行指标范围、整数、趋势或医疗解释。

## 影响

领域写入、来源构造和公开响应现在共享一份确定性换算语义。合法单位携带明显不一致数值时，无论它位于未来还是截断边界之外，都不能静默进入健康洞察。

容差有明确的数据库精度来源，并对 `lb → kg`、`in → cm` 和 `hour → minute` 的放大差异分别生效；它不是数据质量评分或设备准确度声明。错误数据只被拒绝公开，不会被覆盖或删除。

本决策仍不证明来源行属于请求指标、记录真实、设备准确、数值处于健康范围、趋势有意义或用户正确理解统计。

## 参考

- [第 130 轮档案](../../iterations/130-insight-health-persisted-conversion-consistency.md)
- [ADR-0123](0123-insight-health-metric-unit-semantics.md)
- [ADR-0002](0002-health-record-contract.md)
- [ADR-0039](0039-exact-metric-health-observation.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [接口参考](../../api/API_REFERENCE.md)
