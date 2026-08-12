# ADR-0194：Personal Model 精确修订反馈 HTTP

日期：2026-08-12

状态：已接受

## 背景

第 185 轮已经证明内部反馈事件与结果修订可以在 PostgreSQL 中原子提交，第 195 轮和第 199 轮分别开放当前主题认证读取与三主题逐项页面，但客户端仍没有可调用的本人反馈边界。若 HTTP 直接接收内部完整事件或转换结果，调用方可以伪造 owner、服务器时间、结果修订和内部证据；若服务先读取再调用现有事务，并发写入又可能把反馈应用到已经过期的 revision。

本轮只开放认证写入 HTTP、共享公开请求/响应、服务端确定性转换、OpenAPI 和 PostgreSQL 权限证据。客户端按钮、备注编辑、自动刷新、历史、lineage、周回顾和模型导出不在本轮范围。

## 决策

1. 新增 `POST /v1/personal-model/items/{itemId}/revisions/{revision}/feedback`。Bearer principal 是 owner 的唯一来源；路径必须给出 UUID item 与正整数 revision，正文不得携带 userId、itemId、revision、createdAt 或结果修订。
2. `personal-model-feedback-write-request-v1` 只接受客户端生成的 event UUID、四选一 choice、受限 reason、最多 300 字 note 和 temporary 专用有效期。event UUID 是响应丢失恢复凭据，不是授权令牌。
3. 服务端使用接受时刻和新 revision UUID，在 item 行锁内读取最新修订并构造完整内部 event/transition。只有路径 revision 仍是 current、owner 仍为 active、条目非终态且 temporary 截止晚于接受时刻时才能写入。
4. 四项选择固定映射为 `confirmed/temporary/disagreed/uncertain` 与对应 user action。`disagree` 进入 disputed 并增加 `user_disputed`；从 disputed 改为其他选择时移除该限制，并依原置信等级回到 active 或 candidate。反馈不改变 claim、证据或置信数值，也不自动提高建议资格。
5. 当前反馈状态和 temporary 有效期完全一致时，事务追加 `no_op` 事件收据但不生成伪 revision；否则只生成精确下一 revision。结果指纹由固定策略版本、前序指纹、事件及最小结果状态确定性生成。
6. item 锁先于 persisted event 查询。同一 event UUID 的并发重试串行收敛；已提交请求按 target revision、choice、reason、note 与有效期核对后返回首次持久收据，不使用重试时的新服务器时间。相同 UUID 换内容返回 409。
7. `personal-model-feedback-write-response-v1` 只返回 revised/no_op、event/item/目标与当前 revision、choice、当前反馈/条目状态、有效期、服务器接受时间和可空 no-op 原因；不返回 owner、note、reason、claim、证据、内部 revision UUID 或指纹。
8. 无认证返回 401；非法路径/正文返回 400；跨 owner、item 不存在和 active authority 失效统一为无身份线索 404；过期 revision、终态、过期 temporary 或 event 身份换内容返回 409；内部错误保持无内部正文 500。路径级前置中间件让 guard 之前的失败也始终 `private, no-store`。
9. 本轮不增加迁移。现有追加事件、双向延迟外键、不可变触发器与账户级联仍是数据库最终约束；新 command 只是把公开最小输入安全地转换为既有事务对象。

## 影响

- 四项本人校准第一次具有可公开调用、认证、精确 revision 和响应丢失恢复的服务端入口。
- 调用方无法提交伪 owner、创建时间、完整快照或结果指纹；公开响应也不会复制敏感 note/reason 或内部证据。
- 行锁内构造转换消除了“先读当前、后写反馈”的竞态，并保留现有内部 `applyFeedback()` 兼容路径。
- 当前页面仍没有按钮；这只是 P5 的服务端写入基础，不能宣称用户已经完成可见反馈闭环。
- WeApp 总量只余 265 字节。下一轮接客户端前必须先取得结构性包体降幅，不能用提高预算掩盖新增运行时。

## 备选方案

### 让客户端提交完整 `PersonalModelFeedbackEvent`

拒绝。owner、目标、createdAt 都属于服务端权限，公开完整内部事件会扩大伪造面。

### 服务先 `getCurrent()`，再调用既有 `applyFeedback()`

拒绝。两次数据库事务之间 current 可能变化；正确转换必须在同一个 item 行锁内构造并持久化。

### 使用普通 idempotency header 但不保存 no-op 收据

拒绝。响应丢失后无法证明无修订反馈是否已经接受；追加式 event 本身就是更精确的领域幂等身份。

### 在响应中返回完整新 item/revision

拒绝。当前页面已有独立最小读取投影；写响应只需确认结果与新定位，完整快照会复制 claim、证据和内部标识并扩大漂移风险。

### 同轮接入客户端按钮

拒绝。API 权限、并发、重放与公开响应需要独立证明；客户端还面临极窄 WeApp 预算和 temporary/note 交互设计，必须另轮验收。

## 验证

- 公开契约、领域转换、控制器与 OpenAPI 定向测试 4 个文件、44 项通过。
- 真实 PostgreSQL 定向测试 2 个文件、22 项通过；覆盖 Bearer/no-store、owner 隔离、过期 target、并发同事件收敛、首次收据重放、身份换内容冲突、失效 authority、单事件/单修订落库和公开字段最小化。
- 完整单元测试 116 个文件、709 项；完整集成测试 29 个文件、176 项通过。
- 全工作区 strict typecheck、生产构建、H5/WeApp 构建、客户端质量和 production audit high 门禁通过。
- H5 总量/入口/最大异步块为 1,250,867/315,456/149,898 字节；WeApp 总量/vendor/最大页面为 1,149,735/19,338/56,943 字节，预算未提高且禁止标记为零。

## 关联

- [ADR-0179：Personal Model 反馈事件与结果事务](0179-personal-model-feedback-event-transaction.md)
- [ADR-0189：Personal Model 当前主题认证只读 HTTP](0189-personal-model-current-subject-authenticated-http.md)
- [ADR-0193：Personal Model 显式主题单选](0193-personal-model-explicit-subject-selection.md)
- [个人认知模型](../PERSONAL_MODEL.md)
- [第 200 轮档案](../../iterations/200-personal-model-exact-feedback-http.md)
