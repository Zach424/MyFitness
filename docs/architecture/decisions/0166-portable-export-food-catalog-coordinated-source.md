# ADR-0166：便携归档食物目录分层协调来源

日期：2026-08-11

状态：已采纳

## 背景

同步 v4 在 `exerciseCatalog` 之后输出 `foodCatalog`，随后才是 workouts。第 171 轮的协调器已覆盖同意事件、健康记录、健康修订与动作目录，第 170 轮的完整 workout 仍是独立事务；如果跳过食物目录直接连接 workouts，就会改变顶层字段顺序，或迫使调用方跨事务拼接不同事实时刻。

食物选择器把版本化 starter 与 owner 自定义条目组合显示，但同步隐私导出并不复制 starter。starter 是共享产品代码和版本证据，不是用户数据；导出只包含 owner 自定义活动或已归档条目及其不可变修订。条目按 `(created_at,id)` 输出，history 按 revision 输出。单条食物定义字段有契约上限，但修订数量没有上限，因此完整聚合 history 会重新引入无界行载荷。

## 决策

1. 新增内部 `createConsentHealthCatalogSnapshot()`，严格在 `consentEvents`、`healthRecords`、`healthRecordRevisions`、`exerciseCatalog` 之后交付 `foodCatalog`；五个字段共享一次 active-owner 校验和一个只读 `REPEATABLE READ` 根事务。
2. `foodCatalog` 只查询 `user_food_catalog_entries` 的 owner 行，包含活动与归档条目；不读取或复制 `starterFoodCatalog`。其他 owner 的条目和修订失败关闭于查询边界。
3. 条目按 `(created_at,id)` 升序 keyset 分页。迁移 0034 新增非部分 `(user_id,created_at,id)` 索引，使归档条目与活动条目使用同一全历史顺序。
4. PostgreSQL 为每个条目交付与同步 v4 相同键序、但含 `history: []` 的 JSONB 骨架，并移除 `user_id`、`idempotency_key` 和 `request_hash`。Node 只原位替换 history 属性。
5. 每个条目的 revision history 按 revision 升序 keyset 分页，只保存末 revision UUID，并在相同 owner/entry 快照内恢复锚点 revision。既有 `(user_id,entry_id,revision DESC)` 索引反向服务升序读取。
6. 条目骨架与每条 revision 分别在 PostgreSQL 内执行最大 64 KiB UTF-8 门禁。超限只交付实际字节数，不把 payload、条目 UUID、营养事实或 reference 交给 Node 或错误消息。
7. 每个 history 必须恰好一次且完整到达 EOF，才能推进下一条目。活动 history 提前停止、重复读取或查询失败时，具体食物 history 错误直接关闭根事务并拒绝统一收据，不能被通用 collection 错误覆盖。
8. 新增 `createPortableExportConsentHealthCatalogJsonSource()`，把五个顶层字段和两个目录中每个条目的 history 标记为私有递归懒数组，并把协调会话直接作为 JSON 根生命周期。
9. 本轮不连接独立 workout 会话，不修改同步控制器或公开路由，也不新增 KMS、租约执行、下载授权或客户端入口。

## 影响

- 同意、健康当前、健康修订、owner 动作目录和 owner 食物目录首次属于同一数据库事实时刻；前四字段结束后的并发食物新增不会进入第五字段。
- 活动和归档自定义食物均被保留，starter 不重复进入用户数据包；这不验证用户填写的营养事实，也不改变餐食、收藏或照片候选边界。
- 无上限 history 被拆成条目骨架和 revision 子流，数据库到 Node 的每次交付都有独立 64 KiB 上限。
- 统一收据新增 `foodCatalog` 与 `foodCatalogRevisions` 批次/行数，不记录 owner、条目 UUID、名称、营养值、reference、snapshot 或每条内容。
- 真实 PostgreSQL 已证明迁移索引命中、跨 owner/starter 排除、并发隔离、活动 food history 同根取消和完整五字段逐字节等价。
- workouts 仍在独立事务，公开同步导出内存没有下降，R-013 继续开放。

## 备选方案

### 把 starter 与自定义食物一起写入导出

拒绝。starter 是所有安装共享的版本化产品常量，不是 owner 数据；复制它会放大文件并混淆用户保管和软件版本边界。

### 每个条目聚合完整 history 作为一个行 payload

拒绝。修订数量无上限，合法用户历史可以超过 64 KiB；提高门禁或在 Node 聚合都会恢复无界内存。

### 为食物目录打开独立事务再拼到前四字段之后

拒绝。跨事务不能证明目录与同意、健康和动作目录证据属于同一事实时刻，并会重复 owner 校验与取消权威。

### 只导出当前活动条目

拒绝。归档条目和不可变修订仍属于用户保管、纠正与擦除范围，旧餐食也保留选择时的稳定食物快照。

### 把食物目录等同为营养准确性证明

拒绝。该来源只证明 owner 数据的保管与字节边界；用户确认的 reference 和营养值仍不是医疗、实验室或提供方验证事实。

## 验证

- 数据库替身必须证明一个根流、一次 owner 校验、五字段顺序、活动/归档食物、逐条 history 门禁、完整收据和跳过 history 的失败关闭。
- 适配器单元必须证明第五字段到达前不拉取、history 原键位替换、eager/lazy 逐字节一致，以及嵌套 history 先关闭再取消根生命周期。
- 真实 PostgreSQL 必须证明其他 owner 与 starter 不进入、前四字段后的并发新增不可见、归档条目保留、迁移索引被计划使用、完整同步投影与 43 字节块懒 JSON 相同。
- 活动 food history 中止必须让迭代返回、JSON 收据和数据库收据由同一具体错误拒绝。
- 完整单元、串行集成、strict 类型、生产构建、格式、依赖审计、中文文档、迁移索引和 Obsidian 镜像门禁全部通过后才能提交。

## 关联

- [ADR-0165：便携归档动作目录分层协调来源](0165-portable-export-exercise-catalog-coordinated-source.md)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [营养模型](../NUTRITION_MODEL.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 172 轮档案](../../iterations/172-portable-export-food-catalog-coordinated-source.md)
