# 第 128 轮：健康洞察来源凭据有效性

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 D（Data Quality）与 F（Consistency Checking）。范围只有健康洞察原始点的单位、来源元数据和记录时区运行时有效性，以及既有 confirmed-only 来源边界。

验收标准固定为：生产构造器必须复用健康记录来源与健康洞察点 Schema，在排序、未来过滤和 180 点截断前拒绝任一未知规范/展示单位、未知来源类型、非法或越界元数据、无效 IANA 记录时区及 `ai_estimate` 来源；检查覆盖完整来源数组，包括未来点与隐藏第 181 点。公开 Schema 必须独立拒绝无效记录时区和未确认 AI 来源。合法负值仍允许，记录时区不替代响应时区。不得修改 SQL、响应形状、分页、客户端、持久化、计划、AI 提供方或医疗结论。

## 2. 项目结构、设计、技术与实现功能

- `packages/contracts/src/insights.ts`：为健康点记录时区增加 IANA 可解析门禁，并把通用来源 Schema 收窄为当前 confirmed-only 投影的非 AI 来源。
- `packages/contracts/src/insights.test.ts`：证明无效记录时区和带完整模型元数据的 `ai_estimate` 仍在公开健康洞察中按精确字段路径失败。
- `apps/api/src/insights/insights.service.ts`：原始来源对象先通过 `recordSourceSchema`，完整映射点再通过 `healthInsightPointSchema`；两个检查都覆盖全部来源行。
- `apps/api/src/insights/insights.service.test.ts`：在隐藏第 181 点注入未知单位/来源、AI 来源、空白/超长/未知键元数据、数组/空值容器和无效记录时区。
- ADR-0122、架构、已实现 PRD、接口参考、路线图、风险登记册、项目状态和本档案：同步来源门禁、confirmed-only 边界、限制、经验与第 129 轮候选。

本轮没有改变合法响应或错误 HTTP 映射；公开形状不变。

## 3. 实现方法

### 原始来源与公开点双层复用

仅验证映射后的公开点会让空数组或空值元数据在 `Object.keys`/空对象回退中消失。因此构造器先直接验证原始 `{ kind, metadata }`，证明容器和严格字段合法，再验证最终公开点的单位、来源和时间字段。

### 完整来源扫描

凭据检查发生在发生顺序、未来过滤、181 行收据和 180 点公开截断之前。未来点或隐藏点不能等到参考时刻移动、进入公开前缀后才暴露无效来源。

### confirmed-only 证据边界

健康洞察 SQL 只读取 `status = confirmed`。当前数据库契约要求 `ai_estimate` 保持 candidate，因此公开健康点 Schema 明确拒绝 AI 来源；这不是把 AI 值改写为手工值，也不建立新的确认流程。

### 两种时区语义保持分离

记录时区必须是有效 IANA 名称，但只描述记录写入时的民用时间上下文。点的 `localDate` 仍只由绝对发生时刻和当前响应时区计算。

### 不扩大医疗判断

本轮验证有限数值已经属于既有门禁；单位代码和来源格式有效不触发健康范围、改善、异常或诊断解释。指标专属单位关系留给独立迭代。

## 4. 验证证据

- 定向 contracts/API strict 类型与 2 个相关测试文件 16/16 通过。
- 完整 TypeScript strict 通过；完整 Vitest 为 89 个文件、461/461 项通过，完整集成为 20 个文件、66/66 项通过。
- 既有 H5/WeApp 产物通过 `myfitness-client-quality/v1`：H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节。
- 生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 本轮没有客户端、路由、响应形状或视觉变化，因此没有重复全套截图写入；最近完整 Chromium 基线仍为第 113 轮 95/95。AI 提供方、提示与评估语料未变化，最近完整基线仍为服务 7/7、解释 12/12、食物照片 11/11。
- 中文门禁与迁移索引将在提交前验证：预期 `docs/` 共 279 份 Markdown，10 份活跃权威文档，第 090–128 轮和 ADR-0085–0122 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节验证一致：63,870 字节，SHA-256 为 `a48995744228928973dcff18cc73721915cbc30c2479395cf96ec911b6b223ea`。

## 5. 发现的问题与经验

- 验证映射结果不足以证明原始容器有效；会被映射折叠的信息必须在折叠前受检。
- 通用记录来源 Schema 允许 `ai_estimate`，但 confirmed-only 只读投影必须结合自己的资格语义进一步收窄。
- IANA 名称长度正确不代表可解析；来源时区与响应时区有效性需要分别证明。
- 公开 Schema 看不到未来过滤或截断之外的来源行，纯构造边界仍需全量扫描。
- 来源格式正确不证明单位适合指标、设备可信、换算准确或记录具有医疗意义。

## 6. 全局状态、项目反思与下一步

本轮关闭了无效健康单位代码、来源元数据、记录时区和 AI 候选来源在纯构造阶段进入 confirmed-only 投影的路径，并保护未来/隐藏来源点。它没有改变记录值、来源内容或时区派生。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一处同类缺口位于指标与单位的领域关系。已知单位代码仍可能与精确指标不匹配，例如所有体重点一致使用 `cm`。下一轮第 129 轮必须重新排序，当前最小候选是复用 `metricDefinitions` 验证规范单位和允许展示单位，并设计共享响应侧的独立防御；不得重复数值范围判断或改写历史展示值。

本轮未新增或关闭风险：来源门禁不证明指标—单位关系、数值换算、设备/导入真实性、记录健康范围、趋势意义或真实用户理解。风险登记册全表时效复核、真实身份/设备/保留/备份与 AI 专家语料仍保持开放。

## 7. 参考

- [第 127 轮档案](127-insight-exercise-snapshot-validity.md)
- [项目状态](../PROJECT_STATUS.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考文档](../api/API_REFERENCE.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0122](../architecture/decisions/0122-insight-health-provenance-validity.md)
