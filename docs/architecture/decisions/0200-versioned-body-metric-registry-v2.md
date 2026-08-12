# ADR-0200：版本化 Body Metric Registry v2

日期：2026-08-13

状态：已接受

## 背景

现有 `health_records` 只认识 9 个身体/恢复指标，代码、单位和范围分散在共享契约、领域归一化、客户端标签与 PostgreSQL CHECK 中。`dataModel.md` 又提出身高、BMI、围度、身体组成和 InBody 类进阶字段。如果直接扩展旧枚举，会让“目标语言已定义”被误认为“API、历史、隐私与报告流程已上线”，也可能把设备区间或 AI 估算误写成医学判断。

目标字段还存在不同来源：本人手工、设备、导入报告、AI 照片估算、AI 报告提取和确定性计算不能共用一个模糊标签。历史记录必须继续保持旧指标代码、单位和四位精度，已执行迁移也不能为词表发布而改写。

## 决策

1. 发布 `ilens-body-metric-registry-v2`，固定 29 个指标定义。现有 9 项按原顺序标记 `current`；20 个目标字段标记 `planned`。`current|planned` 只表达产品运行能力，不表达身体状态。
2. 每项固定稳定代码、中文名、`body_basic|body_composition|body_advanced|recovery` 类别、规范/展示单位、四位持久精度、技术最小/最大值、整数要求、来源能力和派生声明。同版本任何改名、重排或字段变化必须失败关闭。
3. 技术边界统一携带 `ingestion_guard_not_clinical_range`，只拒绝明显单位或摄入错误。产品不复制设备厂商正常区间，不据此生成诊断、风险等级或建议。
4. AI 照片估算使用 `ai_estimated_candidate`，AI 从报告逐字段提取使用 `ai_extracted_candidate`；二者均不是已确认事实。`manual_entry`、`device_measurement`、`imported_report` 和 `deterministic_derived` 继续保持不同来源能力。
5. BMI、体脂肪量、去脂体重和腰臀比允许确定性派生，并固定独立公式版本与输入指标。BMI v1 使用体重公斤除以身高米的平方；其余公式在实际写入前还须实现精确输入 revision、同时性策略和可复算谱系。本轮不持久化任何派生结果。
6. `body.skeletal_muscle_index` 不从全身骨骼肌量直接派生，基础代谢率也不选择任一预测公式；二者先只允许测量/报告来源，避免把设备定义差异或未经选择的公式隐藏为事实。
7. 注册表只通过显式 `body-metric-registry.constants` 与 `body-metric-registry` 子路径发布，不加入根入口，也不让客户端现有记录页加载 20 个计划定义。旧健康契约、OpenAPI、数据库 CHECK、历史行和双端包体保持不变。
8. Body Assessment 下一轮必须以前向迁移和完整 owner/revision/导出/纠正/删除验收消费计划定义；出现在注册表中不等于获得写入权限。自定义围度与节段身体组成继续后置，直到身份、左右区域、单位和完整度另有决策。

## 影响

- Body Assessment、身体档案和 AI 报告导入第一次拥有同一稳定指标语言，且能在实现前区分可用与计划能力。
- 三层测试锁定现有 9 项的顺序、单位、领域输入护栏和数据库白名单，避免注册表重构静默改变旧记录。
- 计划字段仍不可通过当前 API 写入；本轮没有数据库迁移、OpenAPI 变化、页面或真实 AI 接入。
- 技术范围不是医学范围。未来若提供临床解释，必须独立选择适用人群、证据、地区合规、内容审阅与风险沟通，不能复用摄入护栏。

## 备选方案

### 立即把 20 个目标指标加入现有健康记录 API

拒绝。数据库虽是通用数值结构，但 Body Assessment 的批量事件、报告证据、候选确认、来源位置和删除/导出尚未存在；先开放会产生没有来源闭环的孤立事实。

### 只登记新增指标，不纳入旧 9 项

拒绝。两套词表会继续漂移，且无法证明旧单位、范围和四位精度与新领域共享同一语言。

### 直接采用设备报告的正常范围

拒绝。设备、型号、人群和解释场景不同，工程摄入护栏不能替代医学判断。

### 把 SMI 与基础代谢率也标记为可派生

拒绝。SMI 的分子定义及 BMR 预测公式需要明确来源和适用条件；未作产品选择前保持报告/测量事实更诚实。

## 验证

- 严格运行时拒绝重排、同版本定义篡改、重复来源/单位、无规范单位和派生能力不一致。
- 契约测试证明 29 个身份唯一，精确分为 9 个 `current` 与 20 个 `planned`；单位换算均指向各自规范单位。
- 领域测试证明旧 9 项的单位、最小/最大值和整数规则与 v2 注册表一致；数据库漂移测试证明 `current` 子集与旧指标白名单完全同序。
- 全量验证结果记录在第 206 轮档案。

## 依据与关联

- [CDC：BMI 计算公式](https://www.cdc.gov/growth-chart-training/hcp/using-bmi/calculating-bmi.html)
- [InBody：结果单字段说明](https://shop.inbodyusa.com/products/inbody-580-result-sheets)
- [InBody：ECW Ratio、相位角、骨骼肌与内脏脂肪参数](https://research.inbody.com/result-sheet-interpretation-parameter-keynote/)
- [能力迁移矩阵](../../../funcTable.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 206 轮档案](../../iterations/206-versioned-body-metric-registry-v2.md)
