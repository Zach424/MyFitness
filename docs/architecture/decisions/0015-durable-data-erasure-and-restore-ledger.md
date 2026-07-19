# ADR-0015: Durable data operations and restore-safe erasure ledger

Date: 2026-07-19

Status: accepted

Extended by: [ADR-0022](0022-recoverable-account-erasure-receipts.md)

## Context

Iteration 011 could remove an active account graph and local photo directory, but a process crash between PostgreSQL and filesystem work could leave media behind. A database backup taken before deletion could also restore an account that had already received a deletion receipt. Local disk cannot be shared safely by multiple API replicas, and an external AI provider's retention policy cannot truthfully be represented as a remote-delete confirmation when no deletion API exists.

The release boundary needs a durable, retryable record of every media/data operation, an independently retained erasure signal for restore, and a receipt whose fields describe only work actually completed. It must preserve the existing user-ownership boundary and must not turn the administrator console into a content or deletion control plane.

## Decision

- Store sanitized photos and erasure-ledger entries in one private S3-compatible object-storage boundary. Local development uses a pinned MinIO image; production requires HTTPS, explicit credentials, server-side encryption and externally configured bucket controls.
- Keep logical photo keys in PostgreSQL and make new keys user-scoped. Object writes include a SHA-256 checksum and `If-None-Match: *`; raw uploads are still never persisted.
- Persist `photo_object_delete`, `photo_prefix_delete` and `account_erasure` jobs in PostgreSQL. Workers claim with one transactional `CTE + FOR UPDATE SKIP LOCKED + UPDATE RETURNING`, use two-minute leases, exponential retry and a bounded dead-letter state.
- Create the job in the same database transaction that changes the owning row or account lifecycle. Once a job succeeds, clear its payload and replace its dedupe key so the queue does not become a long-lived identifier index.
- Mark an account `deletion_pending` before returning. This immediately closes authentication and new business work. Return HTTP `202` with a random receipt UUID and a separate 256-bit status token; expose a rate-limited, no-store status endpoint that requires both.
- Before deleting the account graph, publish a versioned ledger entry containing only receipt ID, request time and an HMAC-SHA-256 user reference. The HMAC secret is outside the database. A restored backup must replay every ledger entry and delete matching resurrected users before it can serve traffic.
- A completed receipt clears its direct user reference and HMAC subject reference, while retaining scope/status timestamps and disposition categories. `provider_status=policy_bound` means provider processing was subject to the approved provider policy; it never means a remote deletion API was called.
- Keep administrator access evidence-only. Aggregate queue health and a bounded drain action remain behind the operations token; job payloads, receipt secrets and user identifiers are not returned.

## Consequences

Object deletion and account erasure survive API crashes and can be retried by another replica. A deletion request closes account access even while storage is unavailable. Restoring an older database no longer silently resurrects an account if the independently retained ledger and HMAC secret are available. The client can distinguish queued, running, completed and dead-letter outcomes instead of being shown premature success.

The ledger becomes a critical recovery control: losing it or its HMAC secret invalidates the restore guarantee. Storing it in the same local MinIO service is sufficient only for reproducible development evidence; production must use independent retention/replication, access control, monitoring and restore procedures. ADR-0022 replaces the response-only receipt secret with a single-use intent persisted before deletion and reusable for minimal receipt recovery after commit. Dead-letter recovery is an operator runbook/database action rather than a product endpoint. Object-store lifecycle/versioning, backup schedules, provider approval and legal retention review remain deployment gates.

## Alternatives rejected

- **Synchronous object deletion inside the request:** cannot atomically commit across PostgreSQL and object storage and leaves no durable retry after a crash.
- **Delete the database first, then best-effort media:** loses the authoritative list of legacy object keys and can issue a false completion response.
- **Database-only deletion tombstone:** a backup containing both the account and an earlier tombstone can still predate the deletion; an independently retained control is required.
- **Store raw user IDs in the external ledger:** makes the ledger a durable identity index and increases disclosure impact.
- **Treat `store:false` as provider deletion:** confuses API application-state behavior with abuse-monitoring and contractual retention controls.
- **Expose arbitrary job retry in the admin UI:** broad mutation is outside the evidence-only support purpose and would weaken least privilege.

## References

- [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [AWS SDK for JavaScript S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [AWS SDK for JavaScript S3 checksums](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html)
- [AWS SDK v3 notable S3 changes](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/migrating/notable-changes/)
- [MinIO official Docker image](https://hub.docker.com/r/minio/minio/tags/)
