# Privacy ownership model

Status: durable local ownership/erasure boundary with lost-response recovery, purpose-separated photo custody, catalog history, conflict-safe expiring record drafts, evidence-first optional-consent revocation, pre-save portable-export verification and bounded owner-visible consent history implemented through iteration 084

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

Transport completion is not sufficient client evidence. A lazily loaded file adapter reads the H5 Blob or WeApp temporary file before any H5 download action or WeApp persistent save. A dependency-free verifier requires `application/json` (an optional charset is accepted), the exact four-field v4 envelope, the current data-collection key set, object/array topology, a valid offset generation time, UUID account identifier and an exact UTF-8 size no larger than 50 MiB. Invalid, old-version, wrong-media, oversized or unreadable artifacts never enter success and use product-owned copy only. The page retains only schema version, generation time and byte length as its receipt; account ID and export content are not logged, persisted or rendered. Temporary H5 Blob URLs are revoked on failure and after download. WeApp production compilation proves adapter compatibility, while real-device temporary-file and saved-file behavior remains an explicit external gate.

## Consent lifecycle

```text
never granted → accepted event → active
                         └──────→ revoked timestamp
revoked + new explicit request → new accepted event → active
```

`terms`, `privacy` and `health_data` are required to operate the current account. They cannot be withdrawn independently in the UI; account erasure stops that processing. `ai_plan_explanation`, `food_photo_analysis`, `progress_photo_analysis` and `progress_photo_retention` are optional and independently revocable.

Consent rows remain append-oriented: dropping the old purpose/version uniqueness allows a new event after withdrawal instead of erasing the prior acceptance/revocation interval. AI and photo idempotency locks ensure one consent receipt is created for one unique request. Food-photo withdrawal removes every food analysis and only the `food` object scope. Progress-analysis withdrawal deletes temporary images but preserves separately retained images after clearing their machine checks; progress-retention withdrawal deletes every progress record and only the `progress` scope. AI withdrawal removes pending work while completed user-visible explanations remain exportable until account erasure. Media deletion can remain `pending` during a storage outage without being misreported as completed.

`GET /v1/me/privacy/consents/history` exposes those append-oriented intervals as a separate default-10/max-20 read model. Each item contains only receipt UUID, purpose, version, acceptance time and optional revocation time; it deliberately has no current-status, user/provider or health-data field. The overview remains the only current consent authority used by mutation controls. The opaque cursor carries only version plus receipt UUID, is resolved under the authenticated owner and applies the complete `(accepted_at, id)` comparison inside PostgreSQL so timestamp microseconds are preserved. A new head receipt cannot disturb an issued continuation. H5 proves server-confirmed empty, accepted/revoked labels and 12-item continuation; the client retains no persistent history cache.

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
- Export is generated in API memory and the client rejects artifacts above its 50 MiB boundary; Mini Program real-device download/read/save behavior is not yet exercised.
- Retained progress photos increase that export/custody burden; capture-quality checks do not establish posture, composition or health outcomes.
- Receipt status recovery is secret-gated and tested across response loss/reload, but client secure-storage and final token-retention policy are not yet approved.
- Expiring drafts are minimized and owner-scoped, but H5/Mini Program application-storage encryption, shared-device semantics and operating-system backup behavior still require closed-beta review.
- Dead-letter recovery is a restricted exact-job runbook action; centralized alert delivery and least-privilege recovery tooling are absent.
- Local MinIO, fault injection and restore proof do not establish production bucket encryption/IAM/lifecycle/versioning/replication or provider/legal approval.

Operational detail is in the [data custody runbook](../operations/DATA_CUSTODY_RUNBOOK.md); ADR-0015 records the cross-system ordering and restore-ledger decision, ADR-0022 records the recoverable intent/receipt protocol, ADR-0040 records the bounded local-draft boundary and ADR-0042 records correction revalidation.
