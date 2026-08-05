# ADR-0046: Page owner-definition histories and expose one shared ledger

Date: 2026-08-05

Status: accepted

## Context

User-owned exercise and food definitions keep immutable create/correct/archive snapshots so later edits cannot rewrite workout or meal facts. Their history routes still returned every revision in one response. The food register rendered that unbounded response, while the embedded exercise editor did not expose its existing audit history at all. Both gaps become more significant as users refine long-lived recipes, labels or movement semantics.

## Decision

- `GET /v1/exercise-catalog/:entryId/history` and `GET /v1/food-catalog/:entryId/history` accept strict optional `limit` and `cursor` query parameters and return `{ entryId, items, nextCursor }`.
- Default and maximum page sizes are 20 and 50. Product editors request 10 revisions at a time.
- Both streams remain ordered by immutable revision descending. Continuation uses the existing versioned base64url `{ v, id, revision }` envelope and the predicate `revision < anchorRevision`.
- The cursor UUID must equal the route entry UUID. Before applying it, the API proves that the exact revision exists for the authenticated owner and definition. Invalid, missing-revision, cross-entry or malformed cursors return `400`; missing/cross-owner entries remain `404`.
- Archived entries remain owner-readable because archive is an audit revision, not privacy erasure. A new head revision does not enter an already issued older continuation; a fresh request sees the current head.
- Existing `(user_id, entry_id, revision DESC)` indexes are the query authority. No migration or total-count query is introduced.
- A shared Taro `DefinitionRevisionLedger` presents the same loading, action, version, timestamp, continuation and terminal semantics for actions and foods. The action editor now exposes history for the first time; both clients append older pages without re-sorting.
- Definition values remain user-confirmed descriptive/reference data. Pagination does not verify exercise safety, nutrient accuracy or convert a definition into a recommendation.

## Consequences

Both owner-definition histories are bounded, progressively reachable and consistent across H5 and WeApp. Food history no longer grows an editor response without limit, and exercise corrections gain a visible audit trail while saved workout snapshots remain unchanged.

The exercise editor remains embedded in the already-large workouts route, so its first audit UI adds measurable page weight. A later route split can move definition management to a dedicated lazy page without changing this API or ledger contract.

The weekly-plan history route still uses an unbounded revision query and carries larger structured snapshots. It is the next confirmed local history-growth risk.

## Rejected alternatives

- Page only food history: rejected because the exercise API would stay unbounded and the product would continue hiding its definition audit evidence.
- Add a second history visual dialect: rejected because both are owner definitions with the same action/revision semantics.
- Use offsets: rejected because monotonic immutable revision is already a complete and stable keyset.
- Hide archived history: rejected because archive only removes a definition from future selection.
- Add a migration automatically: rejected because the existing composite descending indexes already match owner, entry and revision.
