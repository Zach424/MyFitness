# 第 161 轮：便携归档训练嵌套边界

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure），并优先保护训练纵向证据。第 160 轮建议先审计 `workouts`，因为它不是简单表：每项同时聚合训练头、动作、组和所有修订历史。本轮先取得能决定实现方向的结构证据，只修复已经确认的排序问题，不抢先接入第四个懒字段。

验收标准固定为：同步 workout 顶层必须按 `(started_at,created_at,id)` 形成总序；动作、组和修订的确定顺序必须由数据库约束证明。真实数据库必须用现有创建契约接受的 30×50 最大结构证明单个当前训练是否能通过 64 KiB 门禁，并确认公开同步导出仍完整保真。若合法当前图已经超限，则必须拒绝简单行源方案并明确嵌套流下一步。

范围不实现 workout 异步来源、不新增迁移、不修改 v4 结构、不调高 payload 上限，不实现 KMS、租约执行器、公开路由、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/privacy.service.ts`：同步 v4 workout 查询补上 UUID 尾序 `(started_at,created_at,id)`。
- `apps/api/src/privacy/privacy.integration.spec.ts`：新增真实 PostgreSQL 训练导出证明；契约解析 30×50 最大输入，以少量批量 SQL 建立同等关系图，避免逐组测试写入。
- 测试反向插入相同 started/created 时间的两个 workout，并独立读取数据库期望顺序。
- exercises 和 sets 以逆序物理插入后验证 position 升序；revisions 以 `[2,1]` 插入后验证 `[1,2]` 输出。
- 测试从导出大训练移除 history 后按 UTF-8 计量，证明当前关系图本身仍超过 64 KiB。
- ADR-0155 固定“不接简单行源、先建递归嵌套来源”的决策；架构、数据库、隐私、已实现 PRD、路线图、R-013 和项目状态同步更新。

## 3. 实现方法

1. 读取第 160 轮状态、档案、ADR-0154 和训练模型，核对同步 SQL、创建契约、关系约束与修订语义。
2. 确认顶层 started/created 时间可相同且缺少唯一尾序；确认父级 position/revision 唯一约束已经覆盖三个嵌套数组。
3. 先做最小行为修复：只给同步 workout 顶层查询增加 `id`，不改变字段、方向或嵌套形状。
4. 用 `createWorkoutSchema.parse()` 生成 30 个动作、每动作 50 组且字符串/数值接近上限的输入，证明测试数据属于公开契约。
5. 用 PostgreSQL `generate_series` 批量建立 30 个动作和 1,500 组，保持与契约相同的字段边界，同时把物理插入顺序反转。
6. 通过公开导出对账顶层 UUID、动作位置、组位置和修订号；再排除 history 单独计量当前关系图，隔离“仅历史导致超限”的错误解释。
7. 根据超限证据拒绝把 workout 作为第四个简单描述项，也不新增尚无查询的全历史索引。
8. 运行目标集成与 API 类型检查后，执行完整单元、集成、strict 类型、生产构建和治理门禁。

## 4. 验证证据

- 目标隐私 PostgreSQL 集成测试 1 个文件、9/9 项通过；新增场景在约 5 秒的测试阶段内完成。
- `createWorkoutSchema` 接受 30×50 输入；公开导出返回 30 个动作且每个正好 50 组。
- 反向插入的相同时间 workout 输出顺序与数据库 `(started_at,created_at,id)` 查询完全一致。
- exercises position 为 1–30，所有 sets position 为 1–50；逆序插入的 history revision 输出 `[1,2]`。
- 把导出大训练的 history 置空后，`JSON.stringify` 的 UTF-8 大小仍大于 64 KiB 门禁，证明简单单行方案会拒绝合法当前事实。
- 完整单元为 98 个文件、518/518 项；完整集成为 23 个文件、88/88 项。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口预算与 Taro webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式、生产依赖、中文与文档索引门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- Obsidian 镜像完成写入并逐字节验证：69,730 字节，SHA-256 为 `bd8fde576e836615e053bf485b634e6384b0eaf5cab31c727e7eef5b6ee53dee`；权威来源始终是 `docs/PROJECT_STATUS.md`。

## 5. 发现的问题与经验

- “一个顶层数组项”不等于“一个安全的数据库 payload”。嵌套数量上限相乘后，即使每个叶子都有限，聚合对象仍可能超过门禁。
- 必须先排除 history 再计量，才能证明问题来自当前关系图，而不是只由长期修订增长造成。
- position/revision 只要在父级内有唯一约束，就已经是确定顺序；不应机械给每层都增加 UUID 尾序和新索引。
- 活动列表的部分索引与完整隐私导出的数据范围不同。索引列看似相同，也不能把 `WHERE deleted_at IS NULL` 的计划证据外推到历史导出。
- 调高单 payload 上限会把已知结构问题隐藏成更大的内存尖峰；正确方向是分层来源和递归 JSON token，而不是放松门禁。
- 结构审计可以是关键实现轮：它修复了真实排序缺口，并用可复现反例阻止下一轮走向不可逆的错误架构。

## 6. 全局状态、项目反思与下一步

本轮让同步训练导出在同时间边界上可复现，同时证明训练事实不能沿用简单集合迁移。这个结果保留了动作、组和修订的完整关系，不把用户训练历史压成摘要，也不把体量问题误称为用户错误。

Inspect → Rank → Improve → Validate 的下一步应先扩展 `PortableExportJsonSource` 的类型契约，使任意 JSON 对象中的数组都能声明私有懒来源；运行时 token 已递归识别该节点，但公开 TypeScript 类型目前只放宽顶层数组。必须新增嵌套 eager/lazy 字节等价、内层按需启动、内层取消和根生命周期测试，然后才能安全定义 workout 头/动作/组/修订来源。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 160 轮档案](160-portable-export-consent-coordinated-snapshot.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0155](../architecture/decisions/0155-portable-export-workout-nested-boundary.md)
