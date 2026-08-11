# Privacy ownership model

Status: durable local ownership/erasure boundary with lost-response recovery, purpose-separated photo custody, catalog history, conflict-safe expiring record drafts, evidence-first optional-consent revocation, lifecycle-safe portable-export verification and consent history implemented through iteration 088

## User-owned surface

The privacy center gives the authenticated account one place to inspect what MyFitness currently holds, download a portable copy, withdraw optional processing consent and leave the service. It is an ownership workflow, not an administrator dashboard or a legal-policy substitute.

The inventory has eight stable user-facing categories: profile/goals, health/recovery records, workouts/exercise definitions, nutrition/meals/favorites/food definitions, weekly plans, AI outputs, photo analyses/progress photos and consent receipts. Counts describe recognizable records rather than every normalized child row. `includesHistory` states whether the corresponding export also contains revision history.

## Private-photo inventory read authority

The purpose-separated food-proof and progress-photo owner lists are custody evidence, not optional decoration. Each client accepts empty only from a complete successful response. Initial failure exposes neither a false-empty sheet nor media actions; refresh failure retains the last successful item set only in page memory, labels it stale and freezes reservation, candidate confirmation, comparison assignment and deletion until explicit retry succeeds. Existing ambiguous-write reconciliation remains separate and cannot replay media or infer physical deletion from list absence. No image, path, list snapshot or recovery instruction is persisted; ADR-0065 records the boundary.

## Profile/goal draft residency

The onboarding register contains broad identity, planning, risk and required-consent intent, so it deliberately does not join the 24-hour record-draft vault. Unread, confirmed-absent and accepted-revision authority plus any local edits live only in page memory. A failed refresh retains the page state but freezes PUT; changed revision never silently rebases it. A 409 performs one read reconciliation without replay, and only an explicit discard action replaces local input with the latest accepted response. No profile draft, risk flag selection, consent toggle, server response or retry command enters application storage.

## Portable export

`GET /v1/me/privacy/export` creates `myfitness-portable-export-v4` directly from a repeatable-read PostgreSQL snapshot. The JSON attachment is marked `no-store`, is not persisted as a server artifact and contains:

- Account lifecycle fields and provider identities.
- Profile, goals and every consent acceptance/revocation event.
- Current and soft-deleted health records plus immutable revisions.
- Workouts with exercises, sets and immutable history, plus active/archived custom exercise definitions and their immutable revisions.
- Meals with item snapshots/history and owner favorites, plus active/archived custom food definitions and their immutable revisions.
- Weekly plans with decision history and AI explanations with provenance.
- Food-photo candidate/selection provenance and any still-retained sanitized JPEG as base64.
- Progress-photo declared view, retention/lifecycle and machine capture-quality provenance plus any still-retained sanitized JPEG as base64.

Raw session tokens, token hashes, idempotency keys, request/input fingerprints, storage keys and provider response identifiers are excluded. The synchronous JSON path is a closed-beta implementation; large-account streaming archives, password/envelope encryption and async delivery remain an operations gate.

API 与客户端共享一个精确的 50 MiB（52,428,800 字节）同步导出边界。API 在 repeatable-read 事务取得全部所有者数据与照片元数据后，先使用相同生成时刻、最终集合顺序和全部 `media: null` 构造完整 v4 JSON 下界；下界按最终缩进、末尾换行和 UTF-8 字节计数，超限时在任何照片对象读取、base64 或附件 `Buffer` 前返回固定 413 `portable_export_too_large`。下界通过后，以本次真实 Buffer 长度计算 `4 * ceil(n / 3)` base64 字符数，再加同层级规范 JSON 包装器得到的固定增量；每个媒体只做 O(1) 计数，当前对象使下界超限时不生成它的 base64，也不读取后续对象。实际 `ENOENT` 使用不可用标记增量，没有存储键保持 `null`；数据库 `byte_size` 不作为拒绝权威。控制器继续测量最终 UTF-8 字符串，成功结果以 `Content-Length` 声明精确字节。传输完成仍不足以成为客户端证据：延迟加载的文件适配器在 H5 下载或 WeApp 持久保存前读取 Blob/临时文件，无依赖校验器要求 `application/json`（允许 charset）、精确四字段 v4 信封、当前集合键、对象/数组拓扑、有效带偏移生成时间、UUID 账号标识和同一 UTF-8 边界。无效、旧版本、错误媒体类型、超限或不可读产物不能进入成功，只显示产品自有文案。页面收据仅保留 Schema 版本、生成时间和字节长度；账号 ID 与导出内容不记录、不持久化、不渲染。H5 临时 Blob URL 在失败和下载后撤销；WeApp 生产编译证明适配器兼容，真实设备临时/已保存文件行为仍是外部门禁。

异步归档的数据库保管模型与同步下载保持分离。`privacy_export_archives` 的六状态、RESTRICT owner 外键、触发器和内部预约服务固定意图、单调状态与所有者读取；确定性对象键和 key-ref 只留在服务端。数据库流事务以只读 `REPEATABLE READ` 固定一个所有者快照，只有内部源到达物理 EOF 才提交；提前停止、查询错误或主动取消都会回滚并释放连接。描述驱动协调器只校验一次 active owner；精确入口 `createConsentHealthSnapshot()` 按 v4 顺序依次读取 `consentEvents`、`healthRecords` 与 `healthRecordRevisions`，原双字段入口继续兼容。三者分别按 25/最大 100 行读取，续页只保留不含用户内容的末 UUID，并在同一快照中解析精确排序元组。同步与异步同意事件均使用 `(accepted_at,id)` 总序；既有降序历史索引可反向扫描，无需复制索引。数据库先把单行投影编码成 JSON 文本并精确计量 UTF-8 字节，只让不超过 64 KiB 的 payload 跨入 Node；超限错误只携带上限和实际字节数，不暴露记录 ID 或内容。内部 v4 JSON 字节源用私有 Symbol 节点放置三个异步行源，根生命周期在三字段结束后仍保管暂停事务：只有整个 JSON 物理 EOF 才 `complete()` 并提交，活动字段、字段间空隙或后续字段取消均 `cancel()` 并以同一根错误拒绝统一分集合收据。真实 PostgreSQL 已证明同时间同意 UUID 总序、跨 owner 排除、第一字段结束后的同意/健康并发写入不会进入后续字段、三懒数组与 eager v4 逐字节一致，以及同意与健康字段间取消时健康源尚未启动。该字节源直接进入分块 AES-256-GCM codec，后者认证格式、owner、archive、v4、key-ref 与完整 EOF。密文再由 multipart writer 按 5–64 MiB 有界部件串行写入，每部件 SHA-256 由存储方验证；只有最终条件创建成功才发布完整存储字节数/SHA-256。任何源错误、主动取消、部件失败或既有对象竞争都会中止未完成 upload；中止本身失败时同时保留原错与清理错，不能发布完成。其他十个顶层集合/嵌套聚合/媒体仍完整驻留，writer 也尚未连接归档状态。没有 KMS 数据密钥 lease、公开预约路由、生成任务、签名下载端点或客户端入口，因此这仍不是可用功能声明。

For non-success responses, the Taro adapter maps HTTP status 413 alone to fixed product-owned size-refusal copy. It does not read, parse, display, log or persist the response body; it releases any H5 temporary Blob and performs no download, WeApp save, automatic retry or erasure-flow export-choice advance. Other non-success statuses keep the generic product-owned failure copy. This narrower status-only boundary avoids granting UI authority to a proxy or server message while leaving the stable API error code available to future archive clients.

The export action also requires one monotonic page generation, mounted component and currently accepted custody overview. That predicate travels into the lazy adapter and is checked before token/network work, after the temporary response and local read, after schema verification and immediately before an H5 anchor click or WeApp `saveFile`. Page unmount, overview refresh, revocation-recovery entry, account-erasure start and logout invalidate the generation. Stale H5 Blob URLs are revoked; if a WeApp save completes while authority ends, the adapter attempts `removeSavedFile` before rejecting. An invalidated operation changes neither the downloaded/skipped erasure choice nor success/error feedback and never restarts automatically. Real H5 proof covers a late complete response after navigation and a custody-freeze race; WeApp rollback remains compile-time rather than physical-device evidence.

## Consent lifecycle

```text
never granted → accepted event → active
                         └──────→ revoked timestamp
revoked + new explicit request → new accepted event → active
```

`terms`, `privacy` and `health_data` are required to operate the current account. They cannot be withdrawn independently in the UI; account erasure stops that processing. `ai_plan_explanation`, `food_photo_analysis`, `progress_photo_analysis` and `progress_photo_retention` are optional and independently revocable.

Consent rows remain append-oriented: dropping the old purpose/version uniqueness allows a new event after withdrawal instead of erasing the prior acceptance/revocation interval. AI and photo idempotency locks ensure one consent receipt is created for one unique request. Food-photo withdrawal removes every food analysis and only the `food` object scope. Progress-analysis withdrawal deletes temporary images but preserves separately retained images after clearing their machine checks; progress-retention withdrawal deletes every progress record and only the `progress` scope. AI withdrawal removes pending work while completed user-visible explanations remain exportable until account erasure. Media deletion can remain `pending` during a storage outage without being misreported as completed.

`GET /v1/me/privacy/consents/history` exposes those append-oriented intervals as a separate default-10/max-20 read model. Each item contains only receipt UUID, purpose, version, acceptance time and optional revocation time; it deliberately has no current-status, user/provider or health-data field. The overview remains the only current consent authority used by mutation controls. The opaque cursor carries only version plus receipt UUID, is resolved under the authenticated owner and applies the complete `(accepted_at, id)` comparison inside PostgreSQL so timestamp microseconds are preserved. A new head receipt cannot disturb an issued continuation. H5 proves server-confirmed empty, accepted/revoked labels and 12-item continuation; the client retains no persistent history cache.

The history client has its own collapsed, initial-loading, ready, refreshing, continuing, initial-error and retained-stale authority phases. Only a completed first page may publish the server-confirmed empty state. Refresh and continuation failures preserve accepted rows plus the unchanged cursor in React memory; a single focused retry repeats the failed operation, and continuation retry sends the identical cursor URL. Offline transport, 4xx refusal, 5xx service outage and unknown adapter results use product-owned copy without backend text. A history failure does not freeze the independently accepted current overview or its revocation controls, and it adds no polling, persistent cache, mutation replay or background synchronization.

History-specific typography uses four component-owned size variables, content-driven control line height and long-token wrapping. A 320 × 844 Chromium run overrides the four levels to exact 2× values and proves no horizontal scroll in first-error, accepted and retained-continuation states. Component variables are used because Taro owns H5 root `rem` sizing for viewport conversion; the matrix does not claim real browser/system text scaling. Pointer behavior remains covered by normal flows; a keyboard-only sequence proves Space/Enter equivalence across open, refresh, continuation, retry and collapse while retaining stable retry focus. These changes are presentation and interaction evidence only and do not alter consent status, retention, export or deletion semantics.

Each history request receives a monotonic client generation. Collapse records only the interrupted operation and optional opaque cursor, advances the generation, removes hidden busy/failure state and permits one explicit reopen to issue a new request. Unmount and loss of parent read authority also advance the boundary. A success or failure may update rows, cursor, retry focus or busy state only while its generation is current and the component remains mounted, open and enabled. Therefore a late empty first page cannot erase a newer accepted page, and a late continuation outage cannot create hidden error/focus state. The transport promise is not physically cancelled, persisted, polled or replayed in the background; an old response simply lacks commit authority.

If a revocation POST loses its response, the client does not repeat it. It retains only the exact purpose in page memory, keeps the accepted inventory visible and freezes every custody action until one explicit current-overview read resolves the purpose. `revoked` proves current inactive authorization, while `active` requires a fresh later confirmation and missing/`never_granted` evidence is divergent. The overview cannot reconstruct the POST's removed-photo/analysis counts, so reconciled completion never displays them; only the original successful response may provide that narrower cleanup result. No revocation purpose, request or recovery instruction enters application storage.

## Expiring local editor drafts

Workout, meal and health-record create/correction forms may keep one owner-scoped `myfitness-sensitive-draft/v1` envelope in platform application storage for at most 24 hours. The client requires the verified user UUID, or the production-disabled development subject fallback, before writing. A different owner, missing scope, incompatible version, invalid structure, expiry or size above 96 KiB prevents restoration and removes the value.

Each page validates only its explicit form fields and asks before restoring. Occurrence-local input, IANA timezone, optional DST offset and a bounded original instant are included because they are necessary to recover or precisely correct the user's fact; they receive the same owner/expiry/size handling as other sensitive draft fields. A correction adds one aggregate UUID and positive base revision, never user identity or a server snapshot. Before restoration the client fetches the current owner-visible list and requires that exact ID/revision; stale or deleted targets are cleared, a failed check keeps the draft for retry and a later race remains subject to API optimistic concurrency. Raw or temporary photo material, authorization state/tokens, erasure intent/receipt secrets, idempotency/request state and AI candidate sheets have no draft field. Successful save, explicit cancel/discard, logout and account-erasure initiation clear drafts; erasure receipt storage remains separate so a lost destructive response can still be recovered. These copies are not included in the server export because they are client-local and ephemeral.

## Account erasure

The client requires all three deliberate signals: an exact `删除我的衡迹账户` phrase, a downloaded-or-skipped export choice and permanent-deletion acknowledgement.

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant A as API
  participant P as PostgreSQL
  participant J as Durable worker
  participant O as Private object storage
  participant L as Restore erasure ledger
  U->>C: exact phrase + export choice + acknowledgement
  C->>A: POST account-deletion-intents
  A->>P: rotate intent; store token hash with 15-minute expiry
  A-->>C: intent UUID + secret
  C->>C: persist secret before destructive request
  C->>A: DELETE /me/privacy/account + intent UUID/secret
  A->>P: consume intent; mark deletion_pending; create receipt + job
  A-->>C: 202 + receipt ID + status token
  C-->>U: access closed; show/poll receipt
  J->>P: atomically claim leased account-erasure job
  J->>L: publish HMAC subject restore control
  J->>O: delete exact legacy keys + user prefix
  J->>P: cascade user graph; complete receipt; clear subject fields
  C->>A: GET receipt with UUID + token
  A-->>C: primary/media/provider/backup disposition
  opt Delete response or page state was lost
    C->>A: POST receipt recover + persisted token
    A-->>C: minimal receipt status
  end
```

All product tables reference `users` with cascades, while new private objects use purpose-separated `private-photos/<user UUID>/<food|progress>/<photo UUID>.jpg` keys. Marking the user `deletion_pending` stops session authorization immediately; storage failure never reopens access. The database transaction also creates a `durable-erasure-v2` receipt and `account_erasure` job. Account work allows 20 leased/retry attempts and becomes `dead_letter` only after exhaustion or invalid payload.

Before deletion, the client requests a 15-minute single-use intent and persists its server-generated 256-bit base64url secret locally. PostgreSQL stores only the SHA-256 hash, and creating another intent rotates the previous one. Deletion requires both the intent UUID and header secret, atomically consumes the intent and reuses the same secret as the receipt credential. `GET /v1/privacy/erasure-receipts/:receiptId` requires `X-Erasure-Receipt-Token`, is rate-limited/no-store and exposes queued/running/completed/dead-letter plus independent primary, media, provider and backup dispositions. If the committed response or receipt UUID is lost, `POST /v1/privacy/erasure-receipts/recover` uses the same header secret to locate and return only the minimal receipt. Keeping the secret out of the URL and masking it in the UI avoids browser-history, proxy-query and shoulder-surfing leakage. Completion clears `requested_user_id` and the HMAC subject field, so the primary receipt cannot identify the deleted account.

Provider semantics are deliberately bounded: `not_applicable`, `fixture_only` or `policy_bound`. OpenAI usage is `policy_bound` because `store:false` does not remove default abuse-monitoring/contractual retention; it is never reported as remote deletion.

Before the main graph is deleted, the worker writes `control/erasure-ledger/<receipt>.json` containing receipt ID, request time and `HMAC-SHA256(secret, user UUID)`. The secret remains outside PostgreSQL. Any restored backup must replay this independently retained ledger before accepting traffic and cascade matching resurrected users. `backupStatus=ledger_published` proves this control exists; it does not mean all backup copies have expired.

The client retains the bearer receipt secret across reloads until explicit local removal or expiry cleanup. This recovers ambiguous commits without restoring authentication, but platform-secure storage and shared-device behavior remain a closed-beta review gate.

## Known limits

- Production identity, account recovery and linked-account deletion are not implemented.
- A real local `pg_dump → pg_restore → ledger replay` drill passes, but production backup schedule/retention, independent ledger replication, HMAC-secret recovery and isolated restore ownership are not configured.
- 同步路径的完整数据库行、非媒体 JavaScript 对象图和格式化初始下界字符串仍在 API 内存中生成；越界的当前媒体 Buffer 也必须先读取，正常请求还会生成全部 base64 和最终字符串。服务端已能在媒体读取前拒绝“初始下界超限”的请求，并在某个真实媒体展开后于 base64 和后续读取前拒绝；新字节源尚未替换同步控制器，也不能减少这些同步分配。无媒体本地夹具在 65,000 条时生成 49,168,658 字节并伴随约 349.16 MiB RSS 前后快照增长，70,000 条返回固定 413；测量包含整个 Node/Nest 进程且受 GC 影响，只证明 R-013 压力，不代表生产容量。小程序真机下载、读取和保存行为也尚未演练。
- 异步归档目前已有共享状态/最小收据、PostgreSQL 保管约束、所有者事务预约、只读流事务、同意事件/健康记录/健康修订有界 keyset 行源、workout→exercise 同根分层源、描述驱动三集合协调器、64 KiB 单 payload 交付门禁、根生命周期递归懒数组 JSON 编码、内部认证加密 codec 和有界 multipart 对象写入。三个已协调集合完成同一快照、根 EOF 提交、字段间取消回滚和字段完整 v4 的组合证明；训练分层源另完成 owner/软删除/动作总序/并发隔离、既有位置索引计划、显式根提交与活动子流优先清理证明，但没有进入协调器或公开 v4。其他十个顶层集合、sets/修订和媒体仍完整驻留，而且这些组件尚无受租约执行器统一状态。该门禁限制数据库向 Node 交付的单元素文本，不限制 PostgreSQL 内部编码成本，也不替代完整文件 50 MiB 门禁。没有 KMS lease、短期下载授权、保留扫描、账号擦除协调或用户入口，不能把 `available` 状态用于任何真实请求。
- 训练所有权导出包含当前关系图、软删除会话和完整修订历史。同步投影已用 UUID 补全同时间顶层顺序，父级唯一 position/revision 保证嵌套顺序；但一个现有契约允许的 30×50 当前关系图在不含历史时已经超过 64 KiB。把它作为一行会拒绝合法用户证据，提高门禁则会恢复无界 Node 分配。内部 `createWorkoutExerciseLayerSnapshot()` 只校验一次 active owner，以全历史 `(started_at,created_at,id)` keyset 读取 15 个会话标量，再为每个会话按 `position` 读取九个动作标量；owner/幂等/请求哈希不进入 payload。每个动作子流必须恰好一次且完整读取，显式 `complete()` 前根事务保持打开；跳过、重复、提前停止或取消会先关闭活动子流，再以同一根错误回滚。后续仍必须在该 owner 根事务中分层读取 sets 与修订，并证明最深内层取消责任继续成立。
- 内部 JSON 来源类型现在允许 workouts 内的 exercises、sets 和 history 使用显式私有懒节点。嵌套测试证明内层数据在字段到达前不读取，首个 set 后停止会先执行其来源清理，再以同一错误取消根生命周期。数据库已补上 workout→exercise 的同根查询和分层收据，但仍没有 set/修订嵌套来源或完整 v4 组合，不能作为训练导出完成证据。
- Retained progress photos increase that export/custody burden; capture-quality checks do not establish posture, composition or health outcomes.
- Receipt status recovery is secret-gated and tested across response loss/reload, but client secure-storage and final token-retention policy are not yet approved.
- Expiring drafts are minimized and owner-scoped, but H5/Mini Program application-storage encryption, shared-device semantics and operating-system backup behavior still require closed-beta review.
- Dead-letter recovery is a restricted exact-job runbook action; centralized alert delivery and least-privilege recovery tooling are absent.
- Local MinIO, fault injection and restore proof do not establish production bucket encryption/IAM/lifecycle/versioning/replication or provider/legal approval.

Operational detail is in the [data custody runbook](../operations/DATA_CUSTODY_RUNBOOK.md); ADR-0015 records the cross-system ordering and restore-ledger decision, ADR-0022 records the recoverable intent/receipt protocol, ADR-0040 records the bounded local-draft boundary and ADR-0042 records correction revalidation.
