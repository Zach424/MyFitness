# ADR-0073: Aggregate delete response-loss recovery

Date: 2026-08-05

Status: accepted

## Context

Health-record, workout and meal deletion already uses an expected revision, server-side soft deletion and immutable history. The client also now keeps an in-flight destructive dialog honest. It still treated every thrown DELETE as ordinary failure, even though a transport interruption can occur after the service commits. Reopening the dialog and repeating DELETE without reading current evidence can misreport the result and turns uncertainty into an implicit replay policy.

All three APIs already expose owner-authenticated exact current-resource reads that conceal deleted or foreign aggregates with 404. Those reads can resolve the user-visible ledger state without adding a server endpoint, idempotency promise or persistent request queue.

## Decision

- Add a dependency-free aggregate-delete classifier that separates network uncertainty, retryable service outage, explicit server refusal and unexpected adapter failure.
- Network, retryable and unknown outcomes require reconciliation. Explicit non-retryable 4xx refusal terminates the current attempt and is never treated as deletion evidence.
- On an unresolved DELETE, close the confirmation modal, retain only the target aggregate/revision in page memory and show one shared ledger receipt. Focus its exact-read action and disable every delete trigger until resolution.
- Reconcile through `GET /health-records/:id`, `GET /workouts/:id` or `GET /nutrition/meals/:id`; never issue DELETE from the reconciliation action.
- An owner-visible 404 proves absence from the current ledger and removes the local row without a second DELETE. It does not make a physical-media claim.
- An exact read at the submitted revision proves there is no deletion success evidence. Clear recovery and allow only a later fresh user confirmation.
- Any different revision replaces the local row and invalidates the old deletion intent. The user must inspect and initiate again against the new expected revision.
- A failed reconciliation retains the receipt with a read-only retry. A successful full-ledger refresh is equivalent current evidence and clears the page-memory receipt.
- Preserve server soft-delete/history behavior, optimistic revision headers and parent ledger authority. Add no automatic/background replay, persistent recovery state or offline queue.

## Consequences

The three aggregate ledgers no longer collapse a lost response into either false failure or blind repetition. The recovery action performs one exact read, and delete controls remain frozen while the current result is unknown.

Six unit cases cover failure authority, reconciliation failure and removed/same/changed revision evidence. Real-service browser evidence lets health and meal DELETE commit before aborting only the browser response, then proves exact 404 reconciliation and one DELETE. Workout evidence aborts before commit, proves the same R2 through exact GET, and sends a second DELETE only after the user opens and confirms again.

H5 total grows from 2,764,092 to 2,780,536 bytes and WeApp from 1,005,621 to 1,015,686 bytes. Only total ceilings move to 2,782,000 and 1,017,000; H5 entry/largest async remain 319,235/207,699 and WeApp vendor/largest page remain 18,915/56,044.

Correction PUT response loss remains the next analogous gap. Existing optimistic concurrency prevents silent overwrite, but the client still needs exact revision/content reconciliation rather than a save control that simply repeats the write.

## References

- [ADR-0004](0004-health-record-revision-lifecycle.md)
- [ADR-0005](0005-structured-workout-aggregate.md)
- [ADR-0006](0006-nutrition-snapshot-aggregate.md)
- [ADR-0051](0051-ambiguous-create-response-recovery.md)
- [ADR-0052](0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0072](0072-destructive-record-dialog-focus-boundary.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
