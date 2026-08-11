# 第 168 轮：便携归档训练修订快照原序递归来源

日期：2026-08-11

状态：完成

## 1. 范围、分类与验收标准

本轮分类为 K（Infrastructure）。第 167 轮已有单 revision shape 门禁；审计第 166 轮 history 生命周期后，发现直接组合前还需独立证明 UUID 锚点、JSONB 对象键序和三层取消。本轮因此冻结为一个精确 revision 的根→exercise→set 递归来源，下一轮再接入多 revision history。

验收标准固定为：一次 active owner 校验、一个只读 `REPEATABLE READ` 事务、精确 owner/workout/revision 绑定；shape 先验证且重复 exercise/set UUID 失败关闭；根/动作以空数组骨架保持对象键位，数组正文按 JSON ordinality 和 UUID 锚点分页；根、动作、组各执行 64 KiB 门禁；逐字节重建等于直接 JSONB；三层恰好一次、显式完成提交、最深层取消优先；错误和收据不泄露标识或正文。

范围不增加迁移、第 166 轮 history 连接、公开协调字段、同步导出变化、路由、KMS、租约执行器、下载授权或客户端入口。

## 2. 项目结构、设计、技术与实现功能

- `apps/api/src/privacy/portable-export-database-snapshot.ts`：新增单 revision value/exercise/session/收据类型、不可分解固定错误、根/动作/组生产 SQL、三层页面生成器与 `createWorkoutRevisionSnapshot()`。
- shape SQL 增加规范 UUID 文本和父级范围内唯一性门禁；position 唯一仍用于事实校验，不用于排序。
- 根查询用 `jsonb_set(...,'{exercises}','[]')`，动作查询用 `jsonb_set(...,'{sets}','[]')`；Node 原地替换现有字段为私有懒数组，不删除再追加键。
- exercise/set 查询都以 `WITH ORDINALITY` 保存 JSON 数组原序，只在同一 revision/父 exercise 内用上一 UUID 恢复锚点。
- 三层 payload 都在 PostgreSQL 内编码并按 UTF-8 计量；shape 不通过时根查询不启动，固定错误不含正文。
- 单元新增原序重建/显式提交、不可分解零正文读取、跳过动作失败和活动 set 取消四项；真实集成新增逐字节 JSONB 等价/跨 owner、未知形状无正文和最深层取消三项，并扩展重复 exercise/set UUID 证明。
- ADR-0162 固定单 revision 边界、占位键序、UUID ordinality 锚点和下一轮 history 连接责任；状态、架构、数据库、训练模型、隐私、PRD、路线图与 R-013 同步更新。

## 3. 实现方法

1. 复读第 167 轮状态、档案和 ADR-0161，逐段审计第 166 轮 workout→exercise→set→revision header 生命周期。
2. 对照同步 v4 的 JSONB 聚合和 `z.record` 边界，确认只保留数组 ordinality 仍不足以证明对象键序兼容。
3. 选择“空数组骨架 + 原地替换”方案：让 PostgreSQL 保留 JSONB 规范键序，同时把数组正文移出单 payload。
4. 将 shape 的根/动作字节测量改为实际空数组骨架，并补充 exercise UUID 全 revision 唯一、set UUID 同父唯一门禁。
5. 为根、动作、组分别建立 owner/workout/revision 精确查询；动作和组用 UUID 锚点子查询恢复 ordinality，不把 ordinality 暴露到应用收据。
6. 复用现有 `boundedPagePayloads()`，使实际 payload 与 shape 前置检查都执行 64 KiB 失败关闭。
7. 建立单 revision 三层一次性会话：shape 和正文共享事务，根只输出一次，父级不得在子级完整 EOF 前推进。
8. 复制既有最深活动来源清理语义，避免活动 set 的 `return()` 与 exercise/root 清理生成第二个竞争错误。
9. 用数据库替身验证根查询在不可分解时为零次、批次收据、显式提交、跳过和取消；用真实 PostgreSQL 验证 JSONB 字节、反序、重复 UUID、跨 owner 和固定错误。
10. 先运行目标 35 项单元、29 项集成和 API typecheck，再执行完整单元、集成、strict 类型、生产构建与依赖审计。
11. 第一次全量集成因前序目标测试占用共享本地 Redis 开发登录/IP 限流窗口而出现无关 429；等待窗口后串行复跑 23 个文件全部通过，不把环境噪声记作产品缺陷或隐藏失败。
12. 完成中文档案、治理门禁和 Obsidian 逐字节同步后提交。

## 4. 验证证据

- 目标数据库快照单元测试为 1 个文件、35/35 项通过；API strict typecheck 通过。
- 目标真实 PostgreSQL 集成为 1 个文件、29/29 项通过；本轮没有新增迁移。
- exercise 与首动作 set 的 position 都为 `[2,1]` 时，来源仍按 JSON ordinality 输出，物化结果与 `SELECT snapshot` 直接 JSONB 的 `JSON.stringify` 逐字节相同。
- `batchRows=1` 的两动作三组报告 snapshot 根 1 批/1 行、动作 2 批/2 行、组 3 批/3 行；显式 `complete()` 前事务不提交。
- 重复 exercise UUID、重复同父 set UUID、未知根字段和超限动作头均令 `decomposable=false`。
- 未知 shape 的固定错误不含秘密动作名，单元数据库替身证明根正文查询为零次；跨 owner 与不存在 revision 使用相同 not-found。
- 活动 set 后主动取消会先结束 set 和 exercise，再以同一根错误拒绝 snapshot 与收据；真实 PostgreSQL 和数据库替身均通过。
- 完整单元为 98 个文件、544/544 项；完整集成为 23 个文件、106/106 项。首次全量集成的共享本地限流 429 在串行复跑后消失。
- 完整 strict 类型和生产构建通过；H5 仍只有已登记的 308 KiB 入口、Taro dynamic import 和 webpack cache 警告，本轮没有客户端源代码变化。
- 完整格式与生产依赖门禁通过；生产依赖为 0 个 critical/high、9 个已登记 moderate。
- 中文文档门禁通过；迁移索引确认 `docs/` 共 359 份 Markdown，第 090–168 轮 79 份、ADR-0085–0162 78 份连续受保护，待迁移总量保持 191。
- Obsidian 镜像已写入并逐字节验证：70,866 字节，SHA-256 `f9af7c51233b6884cdf44fe824de23cf4e4c1dc703bfdcd6a994162c66fc6a38`。

## 5. 发现的问题与经验

- 数组原序与对象键序是两个独立兼容维度。只用 ordinality 保护数组，但删除再追加懒字段，仍可能改变最终 JSON 字节。
- 空数组占位是低风险桥接：PostgreSQL 保留 JSONB 键序，Node 只替换值，递归编码器无需引入特殊对象协议。
- UUID 锚点在使用前必须证明父级范围内唯一。依赖“服务端通常生成 UUID”而不检查历史 JSON，会把异常证据变成静默截断风险。
- shape 与正文必须共享同一 repeatable-read 事务；先用独立诊断通过、再打开第二个事务读取会留下检查时刻与交付时刻裂缝。
- 页面查询在恰好填满批次时会执行一次终止空页查询；批次收据只统计有数据页面，SQL 调用次数不应冒充交付批次数。
- 本地限流器也是测试共享状态。目标/全量集成连续运行可产生 429 环境噪声；必须串行复跑取得完整绿灯，不能降低断言或把 skipped 当通过。

## 6. 全局状态、项目反思与下一步

本轮第一次交付了不可变 workout revision snapshot 的有界正文，而不仅是头或 shape。它仍是内部单 revision 会话，没有进入第 166 轮 history，也没有减少同步下载内存；因此不能声称训练导出或异步归档完整流式化。

Inspect → Rank → Improve → Validate 的下一步应把 `createWorkoutRevisionSnapshot()` 的三层责任嵌入 `createWorkoutRevisionHeaderLayerSnapshot()` 的 history：每个 revision 头之后必须完整读取其 snapshot，才能推进下一 revision；history、snapshot exercise 和 set 都恰好一次，根 `complete()` 前不提交。组合后应把内部结构物化为现有 `{id,action,revision,snapshot,changed_at}`，与同步 v4 逐字节比较，并验证跨 revision、当前关系图之后的同一事实时刻和最深层取消。

R-013 保持中等级开放；R-005、R-009 和其他风险等级不变。真实 KMS、云存储、账号、域名、设备与付费 API 继续停放。

## 7. 参考

- [第 167 轮档案](167-portable-export-workout-revision-snapshot-shape-receipt.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE_DESIGN.md)
- [训练记录模型](../architecture/WORKOUT_MODEL.md)
- [隐私所有权模型](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0162](../architecture/decisions/0162-portable-export-workout-revision-snapshot-ordinality-source.md)
