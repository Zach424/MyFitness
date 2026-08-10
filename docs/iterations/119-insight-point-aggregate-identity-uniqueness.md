# 第 119 轮：洞察点聚合身份唯一性

日期：2026-08-11

状态：已完成

## 1. 范围、分类与验收标准

本轮分类为 C（Evidence Modeling）与 F（Consistency Checking）。范围只有动作和健康洞察点的聚合 UUID 唯一性。

验收标准固定为：两个生产构造器必须在未来过滤、180 点截断、首点摘要和 `hasMore` 派生前，验证全部输入行的 `workout_id`/`record_id` 唯一；隐藏的第 181 行重复也必须失败。两个共享 Schema 必须拒绝公开 `workoutId`/`recordId` 重复，并把错误定位到第二个重复项的 ID 字段。不得静默去重、排序或选择一个副本，也不得修改 SQL、窗口统计、客户端、响应形状、持久化、计划算法、AI 或健康结论。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/insights/insights.service.ts`：新增泛型 `assertUniqueInsightPointRowIds`，由动作/健康构造器分别提供训练 ID 和记录 ID 选择器，在过滤与截断之前扫描全部输入。
- `packages/contracts/src/insights.ts`：新增共享 `validateUniqueInsightPointIds`，由两个 Schema 提供公开 ID 选择器和路径字段；固定窗口、本地日、顺序与未来点门禁继续执行。
- `apps/api/src/insights/insights.service.test.ts`：两个现有投影用例都只在第 181 行复用首点 UUID，证明隐藏行不能绕过唯一性门禁。
- `packages/contracts/src/insights.test.ts`：动作与健康契约分别证明第二个重复 `workoutId`/`recordId` 的精确路径，且测试序列保持时间非递增，避免由排序错误间接失败。
- `docs/product/IMPLEMENTED_PRD.md` 与 `docs/api/API_REFERENCE.md`：补充聚合 UUID 唯一、重复身份不静默去重的产品/接口边界。
- ADR-0113、架构、路线图、风险登记册、项目状态和本档案：同步身份规则、验证范围、无新增/关闭风险和第 120 轮候选。

本轮没有改变聚合主键、添加数据库约束或修改响应字段。正常生产查询本来唯一，正常响应不变。

## 3. 实现方法

### 在证据选择前验证整个来源集合

构造器使用一个局部 `Set<string>` 扫描输入。检查发生在未来点过滤和 180 点切片之前，因此未来副本或隐藏第 181 行副本都不能影响或逃过证据选择。最多 181 个 UUID 的内存边界固定，不保存到请求外。

### 重复项承担精确错误路径

首个 UUID 建立已见集合，第二次出现时才产生错误。契约将 Issue 放在第二个重复项的公开 ID 字段，使替代适配器能直接定位冲突，而不是把整个 `series` 标成模糊无效。

### 不用去重掩盖来源错误

保留首项会隐藏可能较新修订，保留末项会改变最新优先顺序，先去重再计算 `hasMore` 还会改变截断语义。任何自动策略都会虚构选择依据；本轮因此失败关闭并保留上游故障可观察性。

### 身份与时间门禁保持正交

两个不同聚合允许拥有相同 `occurredAt`；同一聚合即使时间不同也不能重复。唯一性不能由非递增顺序推导，反之亦然。共享 refinement 继续分别输出身份、顺序、本地日和未来点路径。

## 4. 验证证据

- 定向 Contracts/API strict 类型通过；2 个相关测试文件 16/16 通过。
- 完整 TypeScript strict 通过；完整 Vitest 为 89 个文件、461/461 项通过，完整集成为 20 个文件、66/66 项通过。
- 既有 H5/WeApp 产物再次通过 `myfitness-client-quality/v1`：H5 总量/入口/最大异步 JavaScript 为 1,210,899/315,266/152,167 字节；WeApp 总量/vendor/最大页面为 1,108,121/19,338/57,302 字节。
- 生产依赖为 0 个 critical/high，仍有 9 个已登记 moderate。
- 本轮没有客户端、路由、响应形状或视觉变化，因此没有重复全套截图写入；最近完整 Chromium 基线仍为第 113 轮 95/95。AI 代码和评估语料未变化，最近完整基线仍为服务 7/7、解释 12/12、食物照片 11/11。
- 中文门禁与迁移索引通过：`docs/` 共 261 份 Markdown，10 份活跃权威文档，第 090–119 轮和 ADR-0085–0113 连续受保护，待迁移总量仍为 191。
- Obsidian 镜像已写入并逐字节验证一致：63,650 字节，SHA-256 为 `4e038fc0ec7bc5952df28f50f01721dd3863a30b20f036ff35971bc4620537f0`。

## 5. 发现的问题与经验

- 数据库主键唯一不能自动证明投影数组没有重复；聚合、适配器和夹具边界仍需身份门禁。
- 隐藏的第 181 行仍属于证据选择输入，唯一性检查不能只覆盖最终公开点。
- 去重不是中性的修复：它会改变首点、点数、截断和 `hasMore`，并掩盖错误来源。
- 重复证据与重复时刻不同。多个真实聚合可以同时发生，唯一性必须绑定聚合 ID 而不是时间戳。
- 共享泛型扫描器适合服务端不同原始字段；契约路径仍应由调用者显式提供，以保留公开语义。
- 唯一身份提高证据账本质量，但不能证明来源真实性或集合完整性。

## 6. 全局状态、项目反思与下一步

本轮防止一条训练或健康事实在纵向观察中被重复绘制、重复计数或错误解释，提高证据身份稳定性。它没有合并真实重复行为，也没有从 UUID 推断趋势、异常或因果。

按 Personal Cognitive Mirror 的 Inspect → Rank → Improve → Validate 反思，下一处 Foundation Value 较高的缺口位于首点派生摘要。动作顶层 `identity` 和健康顶层 `canonicalUnit` 由首点派生，但共享 Schema 未证明空序列摘要为空、非空时与首点一致；健康序列也未证明全部点规范单位一致。替代响应可用旧名称标注最新动作，或把不同量纲放入同一时间线。下一轮第 120 轮必须重新排序；当前候选是失败关闭摘要/首点错位及健康点单位漂移，并提供精确路径。

本轮未新增或关闭风险：UUID 唯一性不证明来源真实性、证据完整性、统计意义或用户理解。风险登记册全表时效复核、真实身份/设备/保留/备份与 AI 专家语料仍保持开放。

## 7. 参考

- [第 118 轮档案](118-insight-point-descending-order.md)
- [项目状态](../PROJECT_STATUS.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [接口参考文档](../api/API_REFERENCE.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [ADR-0113](../architecture/decisions/0113-insight-point-aggregate-identity-uniqueness.md)
