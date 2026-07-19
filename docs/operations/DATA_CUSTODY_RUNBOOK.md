# Data custody operations runbook

Status: local implementation and restore-drill evidence; production storage, backup, alert and legal ownership are not yet assigned

## Boundary and ownership

This runbook covers private sanitized food photos, durable deletion jobs, account-erasure receipts and the restore erasure ledger. It does not authorize operators to browse health content, download photos, impersonate users or promise external-provider deletion beyond the recorded disposition.

The application owns three coupled but separately observable states:

1. PostgreSQL owns account/resource lifecycle, job state and the minimal receipt.
2. Private S3-compatible storage owns sanitized photo objects and `control/erasure-ledger/*.json` restore controls.
3. Provider disposition records whether no provider was used, only the local fixture was used, or approved provider policy controls remain applicable.

## Deployment preflight

1. Configure `OBJECT_STORAGE_ENDPOINT`, region, bucket and credentials through a secret manager. Production endpoints must be HTTPS.
2. Set `OBJECT_STORAGE_FORCE_PATH_STYLE` only when required by the chosen provider. Never make the bucket or photo prefix public.
3. Enable `OBJECT_STORAGE_SSE=AES256` or `aws:kms`; for KMS also provide `OBJECT_STORAGE_KMS_KEY_ID`. Configure least-privilege IAM for head/get/put/delete/list on the exact bucket/prefixes.
4. Set independent, at-least-32-character `PHOTO_UPLOAD_SIGNING_SECRET` and `ERASURE_LEDGER_HASH_SECRET` values. The latter protects both user and provider-identity references. Back it up through the secret-recovery process; rotating it requires a versioned dual-read migration across the ledger and `auth_identity_suppressions`.
5. Configure `PHOTO_OBJECT_PREFIX` and `ERASURE_LEDGER_PREFIX`. Apply bucket encryption, versioning/retention, lifecycle, access logs, replication and restore tests outside the application; the local Compose stack does not prove those controls.
6. Apply all checksum-verified migrations. Enable the worker on at least one API replica and choose a polling interval appropriate to the service objective.
7. Verify `GET /v1/health` reports PostgreSQL, Redis and object storage `up`. Verify the private bucket rejects anonymous access.
8. Verify `GET /v1/internal/data-operations` with the operations token returns only aggregate counts and no UUID/payload. The token must remain on a private network path.

## Job lifecycle

```text
queued ──claim/lease──> running ──success──> succeeded
   ^                       │
   │                       ├─ transient failure ─> retry_wait ──available_at──┘
   │                       └─ invalid/exhausted ─> dead_letter
   └──────── expired running lease is reclaimable by another replica ────────
```

- Claiming is one PostgreSQL transaction using `FOR UPDATE SKIP LOCKED`; independent replicas cannot own the same valid lease.
- A lease expires after two minutes. Retry delay starts at 5 seconds and doubles to a one-hour cap.
- Photo jobs allow 12 attempts; account erasure allows 20.
- Successful jobs clear payload and sensitive dedupe material. Failed/dead-letter jobs retain the minimum payload needed to recover, so production database access remains sensitive.
- `POST /v1/internal/data-operations/drain` is a bounded nudge, not an arbitrary job editor. Normal workers retry automatically.

## Account-erasure semantics

An authenticated client first calls `POST /v1/me/privacy/account-deletion-intents`. The API rotates the user's previous intent, returns a 15-minute intent UUID and 256-bit base64url secret, and stores only its SHA-256 hash. The client must persist that secret locally before issuing the destructive request; never log it, display it in full or place it in a URL.

`DELETE /v1/me/privacy/account` requires the intent UUID in the strict request body and the secret in `X-Erasure-Intent-Token`. The server atomically consumes one matching, unexpired intent and reuses its secret as the final receipt status credential. It returns `202` and a receipt ID. The account becomes `deletion_pending` in the same transaction that creates the receipt and durable job, so prior sessions stop authorizing business work immediately. Rotated, expired and already-consumed intents fail closed.

The public status request is `GET /v1/privacy/erasure-receipts/:receiptId` with `X-Erasure-Receipt-Token`. If the delete response and receipt UUID were lost after commit, call `POST /v1/privacy/erasure-receipts/recover` with the same secret in `X-Erasure-Receipt-Token`; it returns only the minimal receipt status and never returns the secret. Both routes are rate-limited and `no-store`; the secret is never placed in a query string. A receipt UUID alone is not authorization. The client keeps the secret across reloads, masks it in the receipt view and offers explicit local removal.

Receipt fields mean:

- `primaryStoreStatus=deleted`: the active user graph was cascaded from the main database.
- `mediaStatus=deleted`: known legacy keys and the whole scoped photo prefix were deleted successfully.
- `backupStatus=ledger_published`: an external HMAC ledger entry exists with the user reference and any provider-identity references; it is not a claim that every backup has already expired.
- `providerStatus=not_applicable`: no recorded provider event; `fixture_only`: only local fixtures; `policy_bound`: an OpenAI-backed event existed and its approved policy/contract governs retention. `policy_bound` is not “remote deleted.”

## Storage or worker incident

1. Keep the account closed; never reactivate `deletion_pending` merely to remove an error message.
2. Check readiness, object-store reachability, credentials, TLS, bucket policy, KMS access and recent configuration changes.
3. Read aggregate job counts. A rising `retry_wait`, old `oldestOutstandingAt` or any `dead_letter` requires investigation and an incident owner.
4. Restore the dependency, then call the bounded drain endpoint or wait for the worker. Confirm counts fall and the receipt progresses.
5. For a dead letter, use a restricted, audited database session to inspect only `id`, `kind`, attempt count and `last_error_code` first. Inspect payload only if recovery cannot be determined otherwise.
6. There is no general requeue API. After the root cause and payload validity are verified, an authorized database operator may reset the exact job to `queued`, clear lease/error fields and set `available_at=NOW()`; the associated receipt must be reset from `dead_letter` to `queued` in the same transaction. Record approver, job UUID, reason and verification result. Never bulk-update by status alone.
7. Confirm the final receipt and object absence. Escalate if the ledger was published but the primary transaction cannot complete; repeated execution is intentionally idempotent.

## Backup and restore

The required order is fail closed:

1. Restore the selected `pg_dump` artifact into an isolated database with no client/API traffic.
2. Verify migration checksums and application compatibility.
3. Load the independently retained erasure ledger and HMAC secret.
4. Run ledger reconciliation against the restored database. It first derives any legacy v1 identity references from the isolated rows, upserts v2 `auth_identity_suppressions`, deletes users matched by user or identity HMAC, and removes their photo prefixes.
5. Verify `restoredUserAfterLedger=0` and `restoredSuppressionsAfterLedger=1` for the drill subject, then run normal integrity/readiness smoke tests.
6. Only after reconciliation and approval may traffic shift to the restored database.

Local evidence command:

```bash
pnpm ops:verify-backup-restore
```

The script creates a real `pg_dump`, restores it to a temporary PostgreSQL database, proves the deleted user is present and its suppression absent before ledger replay, then proves the user is absent and its suppression present afterward. It cleans the temporary database, backup file and verification ledger. This is a development drill, not a production scheduler, retention policy or disaster-recovery certification.

## Minimum alerts and production gates

Alert on readiness failure, `dead_letter > 0`, sustained retry growth, outstanding age above the agreed objective, object-store/KMS errors and restore-ledger replication failure. Assign named owners and exercise delivery before closed beta.

Production remains blocked until cloud bucket/KMS/IAM/lifecycle/versioning/replication are configured; backup schedule/retention and isolated restore are exercised; the ledger has independent durable retention; provider data controls and region are approved; dead-letter alert/recovery ownership exists; receipt-secret platform storage/shared-device behavior is reviewed; and privacy/legal text matches actual retention.
