# Iteration 015 — Durable data operations

Date: 2026-07-19

State: complete locally for the durable storage/deletion/restore slice; production object storage, backup automation, provider/legal approval, alerts and shared deployment remain open

## 1. Scope and success standard

Replace local-only photo deletion and one-request account erasure with a crash-tolerant custody boundary: private S3-compatible object storage, PostgreSQL durable jobs, status-token erasure receipts, provider-disposition semantics and an independently replayable restore deletion ledger. Prove the design with storage fault injection, two-worker claiming and a real `pg_dump → pg_restore → ledger replay` drill.

This round does not deploy a cloud bucket, select a cloud/KMS/IAM owner, create a production backup scheduler, approve an OpenAI retention regime, add a dead-letter UI, solve receipt recovery after a lost HTTP response, or claim legal/public-release readiness.

Acceptance required every photo-removal path to persist retryable work; account access to close before asynchronous erasure; no premature deletion receipt; safe multi-replica claims; restored backups not to resurrect a deleted account when the ledger is present; object storage in readiness; fault evidence; complete regression/dual-client builds; one archive and one commit.

## 2. Structure and technology state

New/changed boundaries:

- `apps/api/src/operations/object-storage.service.ts`: private S3-compatible adapter, key validation, checksummed/encrypted puts, conditional photo creation, get/head/list/delete and test-only fault injection.
- `apps/api/src/operations/data-operations.service.ts`: durable enqueue, lease/claim, execution, attempts, retry/dead-letter and aggregate operations evidence.
- `apps/api/src/privacy/erasure-ledger.service.ts`: HMAC subject references, versioned ledger publication and restored-database reconciliation.
- `apps/api/src/privacy/erasure-receipts.controller.ts`: rate-limited, no-store receipt lookup by UUID plus secret.
- `apps/api/src/scripts/verify-backup-restore.ts`: disposable real backup/restore/ledger-replay proof.
- `infra/postgres/migrations/0013_durable_data_operations.sql`: receipt lifecycle, job/attempt tables and photo-media deletion status.
- `infra/postgres/migrations/0014_harden_durable_erasure.sql`: completed-receipt subject clearing and corrected lifecycle constraint. It is separate because migration 0013 had already been applied during development; checksum history was not rewritten.
- `infra/local/compose.yaml`: pinned official `minio/minio:RELEASE.2025-09-07T16-13-09Z`, private data volume and health check.
- Client/contracts/OpenAPI/E2E: asynchronous account status, separate logical/media-deletion state and status-token presentation/polling.
- `docs/operations/DATA_CUSTODY_RUNBOOK.md`, ADR-0015 and this archive: deployment, incident, restore and limitation evidence.

Technology delta:

- Exact `@aws-sdk/client-s3 3.1090.0` in the API and E2E dev boundary.
- S3-compatible protocol with `forcePathStyle` only for local MinIO, `ChecksumSHA256`, `IfNoneMatch: *`, private no-store objects and production-required SSE (`AES256` or `aws:kms`).
- PostgreSQL 18.4 remains the durable coordinator. No new queue service was introduced; transactional job insertion is colocated with the authoritative lifecycle write.
- Sharp 0.35.3 remains the sanitizer: input metadata is stripped before any object/provider boundary.

## 3. Design, contracts and implemented methods

### Private media boundary

Raw multipart bytes remain memory-only. Sharp rotates, bounds and re-encodes the file; only the sanitized JPEG is written at `private-photos/<user UUID>/<photo UUID>.jpg`. The database keeps a logical `<user>/<photo>.jpg` key, while the storage adapter owns the configured prefix. Legacy unscoped keys remain readable/deletable so existing rows can be erased safely.

Every new upload includes SHA-256 checksum metadata and conditional creation. A duplicate upload cannot overwrite an existing private photo. Bucket auto-creation and no encryption are local-only defaults; production config fails closed on non-HTTPS endpoints, absent bucket/ledger secrets or `OBJECT_STORAGE_SSE=none`.

### Durable operation state machine

Jobs are `photo_object_delete`, `photo_prefix_delete` or `account_erasure` and move through:

```text
queued → running → succeeded
            ├── transient → retry_wait → running
            └── invalid/exhausted → dead_letter
expired running lease → reclaimable running
```

The API creates each job inside the same PostgreSQL transaction that marks media pending, removes a candidate row or changes the account lifecycle. An independent worker claims with a single CTE transaction: ordered candidate selection, `FOR UPDATE SKIP LOCKED`, state/attempt/lease update and `RETURNING`. Leases last two minutes; retry uses `min(3600s, 5s × 2^(attempt-1))`; photo work allows 12 attempts and account erasure 20.

Every attempt is append-recorded. Success clears payload, lease, error and identifying dedupe path. Aggregate operations endpoints expose counts/oldest outstanding only and require the separate operations token. A manual bounded drain exists; arbitrary job content and mutation remain outside the admin UI.

### Account erasure and receipt

Deletion still requires exact phrase, export choice and irreversible acknowledgement. In one transaction the API locks the active user, changes it to `deletion_pending`, creates a `durable-erasure-v2` receipt and enqueues account work. Authentication requires an active user, so previous sessions fail immediately even if object storage is down.

The API returns `202` plus random receipt ID and a 32-byte base64url status token. Only the token hash is stored. The public status endpoint requires the secret in `X-Erasure-Receipt-Token` rather than the URL, is rate-limited/no-store and returns only scope, lifecycle, primary/media/provider/backup dispositions, timestamps and a bounded error code.

Execution publishes the HMAC ledger, deletes every database-known key (including legacy unscoped keys), deletes the user photo prefix, cascades the database graph and completes the receipt/job. Completion clears `requested_user_id` and `subject_ref`; the receipt cannot identify the deleted account. `mediaDeleted` and `mediaDeletionStatus` are separate so deleting a row never falsely proves its object has gone.

Provider disposition is conservative:

- any recorded OpenAI event → `policy_bound`;
- otherwise any fixture event → `fixture_only`;
- no provider event → `not_applicable`.

Official OpenAI data controls distinguish `store:false` application-state behavior from default abuse-monitoring retention (which may be up to 30 days) and approval-based ZDR/MAM. Therefore the product never reports `remote_deleted` without a provider deletion capability and approved evidence.

### Restore control

Before primary deletion, object storage receives `control/erasure-ledger/<receipt UUID>.json` with schema version, receipt, request time and `HMAC-SHA256(secret, user UUID)`. The secret does not enter the database. A backup restored in isolation hashes its users and deletes any match before traffic is allowed.

The HMAC ledger minimizes direct identifiers but is still critical sensitive control data. The local bucket proves the algorithm only; production needs independently retained, replicated/monitored ledger storage and secret recovery.

### Client state

The privacy UI changes from immediate-success wording to three truthful states: queued/running, completed or needs operations. It displays the receipt ID and secret, automatically polls while pending, and explains that account access is already closed. The current client does not persist or recover the secret after response loss/reload; that remains an explicit risk rather than an implied guarantee.

## 4. Validation evidence

- `pnpm db:migrate`: all 14 checksum-protected migrations applied/verified.
- Real restore proof:

```json
{
  "proofVersion": "backup-restore-erasure-v1",
  "backupBytes": 108682,
  "restoredMigrationCount": 14,
  "restoredUserBeforeLedger": 1,
  "ledgerEntries": 1,
  "erasedRestoredUsers": 1,
  "restoredUserAfterLedger": 0,
  "receiptStatus": "completed",
  "backupDisposition": "ledger_published"
}
```

- Storage fault injection proved a photo delete enters `retry_wait` while the object remains, then succeeds after a drain and marks media deleted.
- Account fault injection proved the account becomes inaccessible and receipt remains pending while the object remains, then retry deletes media/user and completes the receipt.
- Two independent `DataOperationsService` instances concurrently drained two jobs; both jobs succeeded exactly once with attempt count 1. Conditional duplicate photo upload also passed.
- `pnpm test`: 30 files / 94 tests passed.
- `pnpm test:integration`: 10 files / 40 tests passed after the independent-worker case was added; photo/privacy fault paths are included.
- `pnpm test:ai`: 7/7. `pnpm eval:ai`: 7/7. `pnpm eval:food-photo`: 8/8. Fixtures were used; no paid model call was made.
- Full workspace typecheck passed. API, administrator, H5 and WeApp production builds passed. WeApp still reports the registered 417 KiB vendor warning and a non-blocking Taro cache warning.
- `pnpm test:e2e`: 21/21 Chromium flows passed, including `202` account erasure, receipt polling, closed session, object/ledger cleanup and all prior product/admin flows.
- `pnpm audit:prod`: 0 critical, 0 high, 6 moderate. The six registered Taro toolchain findings remain.
- Local Compose reports PostgreSQL, Redis, fixture AI and MinIO healthy; readiness requires all data dependencies. The final cleanup audit found and removed six successful E2E jobs, two unreferenced test objects and four empty legacy test directories, then verified zero jobs, durable receipts, deletion-pending users, private objects, restore databases or backup files.

## 5. Problems found and experience captured

- An officially documented Quay example tag did not pull in the current registry path. Checking the official Docker Hub tag inventory produced a real immutable MinIO tag; infrastructure must pin a verified artifact, not infer a tag from prose.
- `store:false` is an application-state control, not a universal zero-retention or delete receipt. Provider UI must model policy evidence separately from owned storage deletion.
- Cross-system erasure cannot be made atomic. The reliable ordering is database outbox/lifecycle close → external idempotent work → final database completion, with a durable retry record throughout.
- A deletion receipt is dangerous if its label exceeds its proof. Splitting primary, media, provider and backup dispositions makes partial/policy-bound outcomes visible.
- A database tombstone inside the same backup domain does not prevent resurrection from an older backup. An externally retained HMAC reference plus mandatory replay does.
- Durable jobs themselves can become a privacy residue. Clearing successful payload/dedupe material and clearing completed-receipt subject fields materially reduces that index.
- `FOR UPDATE SKIP LOCKED` has value only while the selection lock and update share one transaction. The first draft split them across auto-commit calls; the final CTE claims atomically and is exercised by two worker instances.
- Migration 0013 was already checksum-recorded when a completed-receipt field needed hardening. Adding 0014 preserved migration immutability; editing applied SQL would have invalidated drift detection.
- A first E2E cold-start attempt emitted a transient Nest dependency-resolution error, while the same artifact then started independently and a clean full rerun passed 21/21. No reproducible source defect was found; the anomaly is retained as evidence to watch in CI/container startup rather than discarded.
- Test cleanup must include external objects/controls and successful jobs, not only user rows. Privacy and nutrition E2E now delete scoped photo/ledger objects and time-bounded job sets with authenticated S3 access.
- A receipt secret in a query string would leak into common proxy/access logs and browser history. Moving it to a dedicated request header keeps URLs non-sensitive and preserves the same hashed-token authorization boundary.

## 6. Remaining risks, rollback and next step

Not production-deployed or proven: cloud bucket/KMS/IAM/lifecycle/versioning/replication, independent ledger retention, backup scheduler/retention, shared restore environment, centralized queue alerts, dead-letter self-service/review, lost-response receipt recovery, approved OpenAI ZDR/MAM/contract/region, legal/privacy review, DNS, CI/CD or public traffic.

Rollback must not remove migrations 0013/0014 or erase pending jobs. An older application that does not drain the new queue can only be used with traffic held and a forward fix/compatible worker. Before rollback, inspect aggregate outstanding work; after rollback/recovery, verify object storage readiness, drain work with the compatible worker, reconcile receipts and rerun the restore smoke proof. Never reactivate `deletion_pending` accounts to simplify rollback.

Iteration 016 will establish production identity and a repeatable shared test deployment: verified end-user identity, selected managed data services/secrets, centralized telemetry/alerts, calibrated proxy/rate boundaries and an exercised deployment/rollback path. It must carry the data-custody runbook and production gates forward rather than treating local MinIO/restore evidence as cloud readiness.

## 7. References

- [Data custody runbook](../operations/DATA_CUSTODY_RUNBOOK.md)
- [ADR-0015](../architecture/decisions/0015-durable-data-erasure-and-restore-ledger.md)
- [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [AWS S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [AWS S3 checksums](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html)
- [MinIO official image tags](https://hub.docker.com/r/minio/minio/tags/)
- [MinIO Compose guidance](https://github.com/minio/minio/blob/master/docs/orchestration/docker-compose/README.md)
