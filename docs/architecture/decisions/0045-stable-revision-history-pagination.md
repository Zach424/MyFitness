# ADR-0045: Page immutable aggregate histories by revision

Date: 2026-08-05

Status: accepted

## Context

Current health records, workouts and meals are now paged, but each aggregate's audit-history route still returned every immutable snapshot in one response. A frequently corrected long-lived record could therefore make one history sheet, response and database query grow without a bound. Offset pagination is unnecessary for an append-only, monotonically revisioned stream and can make continuation semantics harder to explain when a new revision is created between page requests.

## Decision

- `GET /v1/health-records/:recordId/history`, `GET /v1/workouts/:workoutId/history` and `GET /v1/nutrition/meals/:mealId/history` return `{ aggregateId, items, nextCursor }` and accept strict optional `limit` and `cursor` query parameters.
- The default page is 20 revisions and the maximum is 50. Product clients request 10 revisions per page and expose an explicit load-older action.
- History ordering remains the existing immutable `revision DESC` order. Continuation uses `revision < anchorRevision` and reads `limit + 1`, so every page after the cursor is disjoint and no total-count query is required.
- The existing versioned base64url `{ v, id, revision }` cursor format is reused. It contains no health value, note, time, user identifier or authorization material.
- The route aggregate UUID must match the cursor UUID. The API also proves that the exact cursor revision belongs to the authenticated owner and route aggregate before using it as a boundary. Malformed, cross-resource, foreign or missing-revision cursors return `400`.
- A newly appended revision after page one does not enter continuation from an older cursor. A fresh history read sees it at the head. This is stable traversal of the already older suffix, not a server-held snapshot transaction.
- Soft-deleted aggregates remain owner-readable through history because the aggregate ownership row and immutable revisions remain. Missing and cross-owner aggregate histories remain concealed as `404`.
- Existing `(user_id, aggregate_id, revision DESC)` revision indexes already match the query, so no migration is added.

## Consequences

Audit sheets no longer download an account's entire correction history when opened. Cursor state stays minimal, owner-scoped and independent of sensitive snapshot fields. Revision monotonicity makes page boundaries deterministic across correction and deletion, while fresh reads still expose the newest accepted evidence.

Clients append the strictly older server page, disable the existing continuation control while a request is active and retain already loaded evidence on failure. API consumers that previously omitted query parameters remain source-compatible for ordinary histories up to 20 revisions; consumers that assumed an unlimited response must follow `nextCursor`.

The same unbounded pattern still exists in user-owned exercise and food definition histories. Those separate aggregate families are intentionally left for the next bounded round.

## Rejected alternatives

- Return every revision: rejected because response, parse and render work grows with correction count.
- Offset/limit pagination: rejected because immutable revision numbers already provide a smaller and clearer keyset.
- Put the full snapshot or changed timestamp in the cursor: rejected because those are unnecessary sensitive data and revision is the complete order key.
- Treat the cursor as sufficient authorization: rejected because every request must independently prove current owner scope and exact revision ownership.
- Remove deleted-aggregate history: rejected because soft deletion is a current-view behavior, not destruction of the audit trail.
