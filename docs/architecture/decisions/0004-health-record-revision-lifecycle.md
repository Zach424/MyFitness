# ADR-0004: Health-record revision lifecycle

Date: 2026-07-18

Status: accepted

## Context

Body and recovery measurements are user-owned facts that may be mistyped, corrected or removed from routine views. Overwriting values would destroy provenance; immediately hard-deleting them would make concurrency, support and later privacy workflows ambiguous. A multi-end client can also submit two edits from stale screens.

## Decision

- Keep one current `health_records` row for efficient lists and trends.
- Require the authenticated owner and an expected positive revision for replacement and deletion.
- Treat an edit as a complete validated replacement, incrementing the current revision only when it still matches.
- Copy every accepted current state into `health_record_revisions` within the same database transaction, labeled `created`, `updated` or `deleted`.
- Soft-delete the current row with `deleted_at`; exclude it from ordinary lists but retain owner-only history.
- Return `409` for a stale live revision and `404` for absent, deleted or cross-user mutation targets.
- Preserve idempotent creation; a deleted record cannot be resurrected by replaying its old key.
- Repeat AI candidate/provenance constraints on revision snapshots so history cannot contain a state forbidden in the current table.

## Consequences

Routine reads stay simple, concurrent changes do not silently win, and the product can explain exactly what was corrected. Snapshot duplication costs more storage but keeps audits independent of current-row changes and is acceptable for the initial nine numeric metrics.

Soft deletion is an application correction/history decision, not the completed privacy erasure workflow. Iteration 11 must define account deletion, retention expiry, backup handling and which audit fields may legally remain. Future non-user mutation paths must add actor and reason metadata before use.
