# ADR-0074: Aggregate correction response-loss recovery

Date: 2026-08-05

Status: accepted

## Context

Health-record, workout and meal correction already uses optimistic expected revisions, immutable history and an exact owner-visible current-resource read. The client nevertheless left an interrupted PUT behind the same primary save control. If the service committed before the response disappeared, pressing that control again repeated a non-idempotent correction against an old revision. Optimistic concurrency prevented a silent second commit, but the UI still treated transport failure as durable failure and made the user discover the conflict instead of first reading evidence.

Create recovery cannot be reused: aggregate creation has an owner-scoped idempotency key, while correction has no equivalent request identity. The short-lived local draft vault also preserves editing intent rather than an in-flight network command and must not become an offline write queue.

## Decision

- Add one dependency-free correction-recovery module for failure authority, revision evidence and complete submitted-field comparison across health records, workout graphs and meal snapshots.
- Network, retryable service and unknown adapter outcomes require reconciliation. Explicit non-retryable 4xx refusal terminates the attempt and leaves the input visible for manual correction.
- Retain only target ID, base revision, exact submitted request and a draft signature in React page memory. Persist no request, recovery instruction or idempotency claim.
- While target, base and draft signature still match, replace the primary save action with an exact `GET /health-records/:id`, `GET /workouts/:id` or `GET /nutrition/meals/:id`. Never issue PUT from reconciliation.
- Accept the prior correction only when the current revision is greater than the submitted base and every user-submitted field matches. Ignore server-only IDs, canonical/calculated summaries and timestamps when projecting workout and meal responses, but compare their complete ordered submitted graphs and snapshots.
- If the current revision equals the base, keep the exact draft and current base, clear recovery and require a later explicit save. If the revision differs and submitted content does not match, replace only the comparison base/current ledger row and keep the page-owned draft for review before any new save.
- If the exact read returns owner-concealed 404, remove the stale row and freeze the correction until the user cancels. Do not reinterpret its retained values as a new record.
- A failed exact read retains the same read-only recovery action. Any draft/target/base mutation invalidates the old recovery synchronously for rendering and then clears its page-memory state.
- Add no API, schema, database, polling, automatic/background replay or correction request queue.

## Consequences

The three editors no longer invite blind PUT repetition after an ambiguous response. The visible input and accepted current row remain distinct, and the UI can establish committed success, unchanged evidence or a divergent current version without silently replacing either side.

Six unit cases cover failure authority, revision classification and complete health/workout/meal projections. Real-service browser tests commit health and meal PUT before aborting only the browser response, then prove exact R2 match with one PUT. The workout test aborts before commit, proves R1 through exact GET and sends a second PUT only after a new explicit click. The full main browser suite passes 85/85 and OIDC passes 3/3.

Measured H5 total grows from 2,780,536 to 2,802,178 bytes and WeApp from 1,015,686 to 1,027,824. Only total ceilings move to 2,804,000 and 1,029,000; H5 entry/largest async remain within 320,000/208,000 and WeApp vendor/largest page remain within 25,000/56,100.

Meal favorite add/refresh and removal remain the next local mutation family that can display a false client result after response loss. They should use their exact food-key/list authority without changing meal snapshots or broadening this correction policy.

## References

- [ADR-0042](0042-conflict-safe-correction-drafts.md)
- [ADR-0051](0051-ambiguous-create-response-recovery.md)
- [ADR-0052](0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0073](0073-aggregate-delete-response-loss-recovery.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
