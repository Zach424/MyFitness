# Privacy ownership model

Status: durable local ownership/erasure boundary with lost-response recovery implemented through iteration 022

## User-owned surface

The privacy center gives the authenticated account one place to inspect what MyFitness currently holds, download a portable copy, withdraw optional processing consent and leave the service. It is an ownership workflow, not an administrator dashboard or a legal-policy substitute.

The inventory has eight stable user-facing categories: profile/goals, health/recovery records, workouts, nutrition/favorites, weekly plans, AI outputs, food-photo analyses and consent receipts. Counts describe recognizable records rather than every normalized child row. `includesHistory` states whether the corresponding export also contains revision history.

## Portable export

`GET /v1/me/privacy/export` creates `myfitness-portable-export-v1` directly from a repeatable-read PostgreSQL snapshot. The JSON attachment is marked `no-store`, is not persisted as a server artifact and contains:

- Account lifecycle fields and provider identities.
- Profile, goals and every consent acceptance/revocation event.
- Current and soft-deleted health records plus immutable revisions.
- Workouts with exercises, sets and immutable history.
- Meals with item snapshots/history and owner favorites.
- Weekly plans with decision history and AI explanations with provenance.
- Food-photo candidate/selection provenance and any still-retained sanitized JPEG as base64.

Raw session tokens, token hashes, idempotency keys, request/input fingerprints, storage keys and provider response identifiers are excluded. The synchronous JSON path is a closed-beta implementation; large-account streaming archives, password/envelope encryption and async delivery remain an operations gate.

## Consent lifecycle

```text
never granted → accepted event → active
                         └──────→ revoked timestamp
revoked + new explicit request → new accepted event → active
```

`terms`, `privacy` and `health_data` are required to operate the current account. They cannot be withdrawn independently in the UI; account erasure stops that processing. `ai_plan_explanation` and `food_photo_analysis` are optional and revocable.

Consent rows remain append-oriented: dropping the old purpose/version uniqueness allows a new event after withdrawal instead of erasing the prior acceptance/revocation interval. AI and photo idempotency locks ensure one consent receipt is created for one unique request. Food-photo withdrawal removes every photo-analysis row and transactionally enqueues exact-object plus user-prefix deletion; AI withdrawal removes pending work while completed user-visible explanations remain exportable until account erasure. Media deletion can remain `pending` during a storage outage without being misreported as completed.

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

All product tables reference `users` with cascades, while new private objects use `private-photos/<user UUID>/<photo UUID>.jpg`. Marking the user `deletion_pending` stops session authorization immediately; storage failure never reopens access. The database transaction also creates a `durable-erasure-v2` receipt and `account_erasure` job. Account work allows 20 leased/retry attempts and becomes `dead_letter` only after exhaustion or invalid payload.

Before deletion, the client requests a 15-minute single-use intent and persists its server-generated 256-bit base64url secret locally. PostgreSQL stores only the SHA-256 hash, and creating another intent rotates the previous one. Deletion requires both the intent UUID and header secret, atomically consumes the intent and reuses the same secret as the receipt credential. `GET /v1/privacy/erasure-receipts/:receiptId` requires `X-Erasure-Receipt-Token`, is rate-limited/no-store and exposes queued/running/completed/dead-letter plus independent primary, media, provider and backup dispositions. If the committed response or receipt UUID is lost, `POST /v1/privacy/erasure-receipts/recover` uses the same header secret to locate and return only the minimal receipt. Keeping the secret out of the URL and masking it in the UI avoids browser-history, proxy-query and shoulder-surfing leakage. Completion clears `requested_user_id` and the HMAC subject field, so the primary receipt cannot identify the deleted account.

Provider semantics are deliberately bounded: `not_applicable`, `fixture_only` or `policy_bound`. OpenAI usage is `policy_bound` because `store:false` does not remove default abuse-monitoring/contractual retention; it is never reported as remote deletion.

Before the main graph is deleted, the worker writes `control/erasure-ledger/<receipt>.json` containing receipt ID, request time and `HMAC-SHA256(secret, user UUID)`. The secret remains outside PostgreSQL. Any restored backup must replay this independently retained ledger before accepting traffic and cascade matching resurrected users. `backupStatus=ledger_published` proves this control exists; it does not mean all backup copies have expired.

The client retains the bearer receipt secret across reloads until explicit local removal or expiry cleanup. This recovers ambiguous commits without restoring authentication, but platform-secure storage and shared-device behavior remain a closed-beta review gate.

## Known limits

- Production identity, account recovery and linked-account deletion are not implemented.
- A real local `pg_dump → pg_restore → ledger replay` drill passes, but production backup schedule/retention, independent ledger replication, HMAC-secret recovery and isolated restore ownership are not configured.
- Export is generated in API memory and the Mini Program download API has a 50 MiB practical boundary.
- Receipt status recovery is secret-gated and tested across response loss/reload, but client secure-storage and final token-retention policy are not yet approved.
- Dead-letter recovery is a restricted exact-job runbook action; centralized alert delivery and least-privilege recovery tooling are absent.
- Local MinIO, fault injection and restore proof do not establish production bucket encryption/IAM/lifecycle/versioning/replication or provider/legal approval.

Operational detail is in the [data custody runbook](../operations/DATA_CUSTODY_RUNBOOK.md); ADR-0015 records the cross-system ordering and restore-ledger decision, while ADR-0022 records the recoverable intent/receipt protocol.
