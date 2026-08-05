# ADR-0068: Aggregate revision-sheet read authority

Date: 2026-08-05

Status: accepted

## Context

The body/recovery, workout and meal editors already read bounded immutable revision pages, but the three sheets treated read failure as ordinary page feedback. An initial failure closed the requested health/workout sheet or converted definition state to an empty array, and a continuation failure left accepted rows visible without identifying their bounded stale prefix. The shared parent `loadingMore` state also mixed current-ledger pagination with audit pagination.

An immutable row can remain useful after a failure, but its continuation cursor is no longer current read authority. Unread, successful-empty, accepted prefix and failed suffix therefore need distinct client states even though the server pagination contract remains unchanged.

## Decision

- Use one shared, typed, page-memory history reader for health-record, workout and meal aggregates. It owns the requested target, accepted items, next cursor, busy operation, failure family and request generation.
- Model `initial-loading`, `ready`, `continuing`, `initial-error` and `stale` phases. Classify transport/offline, 4xx refusal, 5xx service and unknown failures into product-owned copy.
- Keep the requested aggregate and sheet mounted when the initial read fails. Do not render a no-version state until the server successfully returns an empty items array.
- During continuation, retain the accepted newest-first prefix. If the request fails, label its exact count, freeze the retained cursor and keep immutable rows readable. Only `ready` may issue another continuation.
- Retry performs only the failed initial or continuation GET. It does not replay a mutation, poll, persist a history cache or advance a stale boundary.
- Give each sheet one stable retry target. Delayed H5 focus and scroll margin keep the complete receipt visible after the continuation control initiated the failed read.
- Closing a sheet, refreshing its parent ledger or unmounting increments the request generation so late responses cannot reopen or replace a different aggregate. History state remains independent from parent create/correct/delete authority.

## Consequences

Unavailable audit evidence can no longer masquerade as no history or silently disappear. A user can inspect the precise accepted prefix while understanding that older versions are not currently verified, then explicitly retry the same suffix. Health, workout and meal pages no longer share their ledger-pagination busy flag with history reads.

The API, cursor envelope, database indexes and immutable revision semantics do not change. The shared state, hook and presentation add measured route output: H5/WeApp totals become 2,736,743/1,003,905 bytes. Entry, largest async JavaScript, vendor and largest WeApp page remain 319,235/207,097/18,915/55,523 bytes; only total ceilings move to 2,738,000 and 1,005,000 bytes.

Owner-created exercise/food definition histories and the Week Fold plan/AI history composition still have separate, weaker failure handling and remain follow-up audits.

## References

- [ADR-0045](0045-stable-revision-history-pagination.md)
- [ADR-0065](0065-record-ledger-read-authority.md)
- [ADR-0066](0066-workout-ledger-read-authority.md)
- [ADR-0067](0067-history-calendar-read-authority.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
