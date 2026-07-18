# Privacy ownership model

Status: implemented locally for the iteration-011 primary-store boundary

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

Consent rows remain append-oriented: dropping the old purpose/version uniqueness allows a new event after withdrawal instead of erasing the prior acceptance/revocation interval. AI and photo idempotency locks ensure one consent receipt is created for one unique request. Food-photo withdrawal removes every photo-analysis row and user-scoped private-media directory; AI withdrawal removes pending work while completed user-visible explanations remain exportable until account erasure.

## Account erasure

The client requires all three deliberate signals: an exact `删除我的衡迹账户` phrase, a downloaded-or-skipped export choice and permanent-deletion acknowledgement.

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant A as API
  participant F as Private media
  participant P as PostgreSQL
  U->>C: exact phrase + export choice + acknowledgement
  C->>A: DELETE /me/privacy/account
  A->>P: lock active user; mark deletion_pending
  A->>F: remove exact legacy keys and user UUID directory
  A->>P: delete user graph + write unlinkable receipt (one transaction)
  P-->>A: primary-store-v1 completion time
  A-->>C: receipt ID; old session is gone
  C-->>U: completion state; no automatic new account
```

All product tables reference `users` with cascades, while the media adapter stores new files under `<user UUID>/<photo UUID>.jpg`. Marking the user `deletion_pending` stops new authentication; uploads that began earlier must still pass an active-user check before entering processing and remove their own file if that check fails. Account purge removes both known storage keys and the whole validated user directory.

The completion receipt stores only a random receipt UUID, `primary-store-v1` scope and completion time—no user ID, identity hash or deleted-content counts. It proves the implemented primary PostgreSQL/private-media boundary, not backups, logs or external-provider deletion. Those require the next operations runbook and production-infrastructure review.

## Known limits

- Production identity, recovery and linked-account deletion are not implemented.
- Database backups, centralized logs and external provider retention are not yet covered by an exercised erasure schedule.
- Export is generated in API memory and the Mini Program download API has a 50 MiB practical boundary.
- Anonymous erasure receipts have no public verification endpoint; support/audit access belongs to the admin-operations iteration.
- Shared object storage, durable reconciliation, fault injection and incident rollback are still required before beta.
