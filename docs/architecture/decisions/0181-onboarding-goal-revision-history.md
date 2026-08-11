# ADR-0181：onboarding goal 不可变修订历史

日期：2026-08-12

状态：已采纳

## 背景

Personal Model 首批 `training_availability_constraint_v1` 必须引用本人确认的精确 `onboarding_goal_revision`。迁移 0039 已把引用投影成不可变关系，但原 `user_goals` 只有一行可覆盖现态；`user_profiles.revision` 虽然表达资料与目标的共同建档版本，却没有保存每个目标版本的内容和稳定聚合身份。把 evidence 直接绑定当前行会让旧引用随下一次建档更新改变含义，无法证明当时的可训练日、时长、器械和目标。

现有账号还带来不可逆事实：revision 大于 1 时，数据库已经丢失被覆盖的早期目标值。迁移不能根据当前值伪造过去，也不能把“只有当前检查点”描述为完整历史。

本轮只建立 onboarding goal 的共享快照契约、稳定聚合、不可变修订、当前/历史原子关系、便携导出和账户删除边界。不把 Personal Model evidence 绑定来源，不实现来源撤回传播、独立目标历史 API 或客户端历史页。

## 决策

1. `user_goals` 新增服务器生成且永久稳定的 `goal_id`，以及与 `user_profiles.revision` 相同的正整数 `revision`。两者在建档事务中共同推进，延迟复合外键阻止资料与目标版本分叉。
2. 共享契约新增严格 `onboarding-goal-snapshot-v1`，保存 `goalId`、`ownerUserId`、revision、动作、历史覆盖范围、完整目标字段和变化时刻。目标字段继续复用建档枚举、唯一数组、时长和饮食互斥规则。
3. `user_goal_revisions` 保存结构列和完整快照。`created` 必须是 revision 1、无前驱且 `complete`；`updated` 必须引用 `revision - 1` 并继承前驱覆盖范围；`migration_checkpoint` 只用于 revision 大于 1 的历史回填、无前驱且为 `checkpoint_only`。
4. 新账号从 revision 1 获得完整历史。迁移 0040 对 revision 1 的既有账号回填 `created + complete`；对 revision 大于 1 的账号只回填真实当前目标，标记 `migration_checkpoint + checkpoint_only`。缺失的早期值和时间绝不推测。
5. 每次成功 `PUT /v1/me/onboarding` 在同一事务先按乐观锁推进 profile/current goal，再追加一条目标 revision。若前驱缺失、覆盖范围不一致、历史漏写或任一后续同意写失败，全部共同回滚。
6. 当前 goal INSERT/UPDATE 与 history INSERT 两侧都安装延迟约束触发器。事务结束时必须命中相同 owner、goal ID 和 revision，结构字段及变化时刻完全一致；只改当前、预写未来历史或写错快照都不能提交。
7. 当前 goal 更新只能精确增加一版，不能更换 owner、goal ID 或创建时刻。历史 UPDATE/直接 DELETE 和当前 goal 直接 DELETE 均失败关闭；账户 owner 删除触发的级联可以清理当前与完整历史。
8. 公开 onboarding 响应保持当前视图，不新增内部 ID 或历史字段。隐私清单把 profile 类别标记为含历史，同步 `myfitness-portable-export-v4` 在当前 goal 对象内加入稳定 ID、revision 和有序 `revision_history`，确保用户能够取得新增个人数据。
9. `checkpoint_only` 是持久语义，不会在后续更新后自动升级为 `complete`。未来 Personal Model 来源绑定只能引用真实存在的 goal revision；迁移检查点之前的编号必须失败关闭。
10. 本轮不建立 `personal_model_evidence_refs` 到 goal/workout 的来源外键。该关系与来源更正/删除资格将在下一轮单独验证，避免把“有来源历史”误写成“证据当前仍有效”。

## 影响

- onboarding goal 第一次具有不会随当前行覆盖而改变含义的稳定来源身份和精确历史内容。
- profile/goal 共同 revision 的既有 API 语义保持不变，计划新鲜度和乐观冲突不需要改协议。
- 新账号完整链与旧账号迁移检查点可以被机器区分，派生器和用户界面不得隐藏覆盖缺口。
- 每次建档写多一行小型 JSONB 快照；真实规模和保留成本需要后续观测，但不能以删除历史解决。
- 同步便携导出继续使用 v4 顶层结构，goal 的通用 JSON 对象新增内部身份、当前 revision 和嵌套历史；50 MiB 总门禁继续生效。
- R-033 的 goal 来源历史缺失得到缓解，但来源外键、当前资格、撤回传播、Personal Model 内容正确性和用户理解仍未证明。

## 备选方案

### 用 `user_id` 直接充当 goal 聚合 ID

拒绝。账户身份与领域聚合身份会被永久耦合，也无法在未来明确表达目标聚合的替换或来源引用；独立稳定 UUID 更符合 EvidenceReference 的聚合语义。

### 只给 `user_goals` 增加 revision，不保存历史

拒绝。版本数字不能恢复当时字段，旧 Personal Model 引用仍会读取到当前内容。

### 把当前目标复制为 revision 1 到当前 revision 的全部历史

拒绝。数据库没有被覆盖值和原变化时刻，复制会制造虚假用户确认事实。单个迁移检查点诚实表达现有证据边界。

### goal 字段未变化时不写历史

拒绝。公开建档 revision 是资料与目标的共同版本，计划和 Personal Model claim 已引用这个版本。每次本人提交都要有对应 goal snapshot，才能精确解释该 revision 下的约束。

### 只依赖应用写历史，不设数据库双侧门禁

拒绝。未来代码路径、原始 SQL 或事务异常可能让当前和历史漂移；提交时两侧核对把完整性放在数据库权威边界。

### 同轮绑定 Personal Model 来源并实现撤回

拒绝。goal history、workout 删除语义、证据资格转换和模型重算各有独立不变量；先验证真实来源历史，再单独完成跨聚合关系。

## 验证

- 静态 schema drift 必须锁定共享快照版本、全部目标枚举、动作/覆盖范围、稳定 ID、profile revision 外键、前驱、快照相等、双侧延迟门禁和不可变触发器。
- 迁移必须对真实既有数据分别产生 `created + complete` 与 `migration_checkpoint + checkpoint_only`，当前/历史不匹配数为零；失败不得写入迁移账本。
- 真实 onboarding API 必须证明 revision 1/2 共享稳定 goal ID、精确前驱、旧/新字段快照、覆盖范围继承和 stale PUT 不增加历史。
- 原始 SQL 必须无法改写/删除历史或提交没有匹配 history 的 current goal；失败事务后当前 revision 和字段保持原值。
- 隐私概览必须把 profile 类别标记为含历史，便携导出必须交付 owner 自己的有序严格快照，不泄露会话或安全哈希。
- 账户删除必须级联 current goal 与全部 revision；strict typecheck、完整测试/构建、依赖审计、双端质量、中文文档、Obsidian 和 Git 差异门禁全部通过后才能提交。

## 关联

- [ADR-0003：身份与建档边界](0003-identity-onboarding-boundary.md)
- [ADR-0176：Personal Model 核心契约](0176-personal-model-core-contract.md)
- [ADR-0180：Personal Model 证据投影内核](0180-personal-model-evidence-projection-core.md)
- [身份与建档模型](../IDENTITY_PROFILE_MODEL.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [第 187 轮档案](../../iterations/187-onboarding-goal-revision-history.md)
