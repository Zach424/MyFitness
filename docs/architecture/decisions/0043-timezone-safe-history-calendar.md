# ADR-0043: Generate a bounded local-date history calendar from current source facts

Date: 2026-08-05

Status: accepted

## Context

Today and the domain-specific observations summarize current evidence, but a user cannot see where records are present across body/recovery, workout and nutrition data or start a careful backfill from a missing day. Joining timestamps by server date would shift facts near midnight, while treating an empty day as zero activity or intake would turn missing evidence into an unsupported behavioral claim.

The three write models already require an exact instant plus IANA timezone and reject invalid, ambiguous or future values. A calendar shortcut must not invent a time simply to make backfill convenient.

## Decision

Expose an authenticated `GET /v1/insights/history-calendar` projection with the existing validated `timezone` and optional reference-instant query contract.

- PostgreSQL generates exactly 28 consecutive requested-timezone local dates ending on the reference instant's local date.
- It counts only the current owner's confirmed, non-deleted health rows and current non-deleted workout/meal aggregates whose occurrence instant is no later than the reference instant.
- Every date is returned. `hasRecords` is true exactly when the three counts sum above zero; a false value means only that no qualifying record exists.
- Correction and deletion are reflected by querying current source rows. No rollup, streak, adherence score or new persistence is introduced.
- The client may route a selected local date and calendar timezone to the three editors only when the date is valid, not future, no more than 90 local days old and the timezone is a valid IANA identifier.
- The routed value is date-only. It is visually explained without being marked as a malformed field, but save remains blocked by the normal occurrence validator until the user supplies `HH:mm`.

## Consequences

The result is bounded, owner-isolated and consistent with source corrections without a synchronization job. PostgreSQL remains responsible for timezone grouping, avoiding host-timezone drift. The calendar cannot assert what happened on a blank day and cannot be used as an adherence engine.

Backfill is one step less repetitive while preserving factual occurrence provenance. The client accepts at most 90 days even though the current calendar exposes 28; this leaves a narrow reusable boundary for future bounded navigation without accepting arbitrary old or future query input.

The query scans three bounded occurrence windows on every load. Appropriate owner/time indexes already support the current scale; iteration 046 will address unbounded editor list loading separately. If measured load later justifies a materialized projection, it requires a new decision with correction/deletion freshness evidence.

## Rejected alternatives

- Use UTC dates: rejected because records near midnight would appear on the wrong user day.
- Persist daily rollups: rejected because they add correction/deletion synchronization and retention/export surface before measured need.
- Prefill noon or the current clock time: rejected because that invents an occurrence fact the user did not provide.
- Display streaks, completion or intake zeros: rejected because missing records are not evidence of behavior.
- Merge the projection into the Today response: rejected because Today has a different single-day loading and presentation boundary.
