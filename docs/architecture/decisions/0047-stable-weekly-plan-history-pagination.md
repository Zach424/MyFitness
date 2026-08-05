# ADR-0047: Page weekly-plan revision history by exact owner revision

Date: 2026-08-05

Status: accepted

## Context

Weekly plans retain complete structured snapshots for generation, regeneration and every accepted/modified/skipped decision. The history endpoint returned the entire stream in one response and Week Fold rendered it eagerly. A long-lived weekly aggregate can therefore grow through repeated evidence-driven regeneration and review decisions, making this the last direct unbounded `ORDER BY revision DESC` history query after record and definition pagination.

## Decision

- `GET /v1/plans/weekly/:planId/history` accepts strict optional `limit` and `cursor` query parameters and returns `{ planId, items, nextCursor }`.
- Default and maximum page sizes are 20 and 50. Week Fold requests 10 plan revisions at a time.
- History remains newest-first by immutable revision. Continuation reuses the versioned base64url `{ v, id, revision }` envelope and queries only `revision < anchorRevision`.
- The cursor UUID must equal the route plan UUID. The API separately proves the current plan belongs to the authenticated user and that the exact anchor revision exists for that user/plan. Malformed, cross-plan or missing-anchor cursors return `400`; missing and cross-owner plans remain `404`.
- `weekly_plan_revisions_user_plan_idx (user_id, plan_id, revision DESC)` remains the query authority, so no migration or total-count query is added.
- A decision or regeneration created after page one does not enter its older continuation. A fresh request resets to the new head.
- Historical snapshots still pass legacy evidence normalization and the full weekly-plan schema before response. Plan content, decision notes, evidence, timestamps and user identifiers never enter the cursor.
- Week Fold appends older decisions only after an explicit accessible action, keeps loaded history on failure and reports completion without an exact lifetime count. Pagination does not alter plan freshness, eligibility, substitution, AI consent or safety behavior.

## Consequences

Every direct user-facing revision-history query is now bounded by a stable owner/resource/revision keyset. Large structured plan snapshots no longer grow one response indefinitely, and users can still inspect the complete decision trail without infinite scroll or hidden background reads.

The client adds a small amount of state and copy. Measured H5 remains within its existing limits; WeApp total increases to 806,733 bytes, so only its reviewed total ceiling moves narrowly from 806,000 to 807,000 bytes. The largest page remains the embedded workouts/action-definition route at 50,338 bytes and is the next local bundle-debt target.

## Rejected alternatives

- Keep the complete history because most plans are short: rejected because regeneration and decisions are intentionally repeatable and snapshots are comparatively large.
- Offset pagination: rejected because immutable monotonic revision already provides a simpler stable keyset under concurrent heads.
- Put the current revision or decision content in the cursor: rejected because cursor data appears in URLs/logs and is unnecessary for ordering.
- Reuse plan freshness as a pagination boundary: rejected because freshness is a non-persisted current projection, not immutable history order.
- Add a new index automatically: rejected because the existing owner/plan/revision descending index exactly covers the query.
