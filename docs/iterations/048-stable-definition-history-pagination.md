# Iteration 048 — Stable definition-history pagination

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Owner-created exercise and food definitions preserve immutable revisions, but both history endpoints queried the full stream. The food register rendered all results; the action editor exposed no definition history even though corrections and archive were audited. This round bounds both streams and gives them one consistent client ledger.

Success requires strict shared query/response contracts; 20-item default and 50-item maximum server pages; stable newest-first revision continuation; cursors without names, equipment, nutrients, references, times or user identifiers; route/owner/exact-anchor validation; archive-safe reads; indexed PostgreSQL queries; 10-item progressive clients; a newly visible exercise history; one shared accessible ledger; existing snapshot/non-prescriptive boundaries; mobile browser proof; and measured dual-platform packages.

This round adds no cloud service, external provider, external dataset, migration, nutrition verification, exercise-safety claim, plan behavior or medical recommendation.

## 2. Structure, technology and design state

- Exercise/food contract modules now export typed history queries and bounded `{ entryId, items, nextCursor }` responses.
- Both NestJS controllers validate and document strict history `limit`/`cursor` query strings; generated OpenAPI stays the committed API reference.
- Both services validate route UUID plus exact owner revision, then execute the existing descending index as `revision < boundary ORDER BY revision DESC LIMIT limit + 1`.
- `apps/client/src/components/definition-revision-ledger/` owns the cross-domain version/action/name/time list plus loading, load-older and exhausted states.
- The food register replaces its page-local whole-history renderer with the shared component. The embedded action-definition editor now fetches and renders the same audit evidence for the first time.
- Integration tests extend the original snapshot/export/archive scenarios instead of creating a parallel fixture family. Playwright adds a 12-version food-definition proof and exercises the action ledger inside its existing lifecycle test.
- ADR-0046, architecture/model/API/design/roadmap/README and global status record the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, parameterized PostgreSQL 18, Vitest and Playwright. No runtime dependency or SQL migration was added.

## 3. Implementation method

### Reuse the cursor grammar, not sensitive definition fields

The existing cursor envelope contains only version, definition UUID and positive revision. Each endpoint requires the UUID to match the path and separately checks the exact owner revision before treating it as a boundary. Names, aliases, equipment, nutrient values, references and timestamps stay in authenticated response bodies rather than URLs, browser history or logs.

Continuation requests only revisions below the anchor. Creating or archiving a newer revision after page one therefore does not move the older suffix. A fresh request returns the new head. Existing owner/entry/revision descending indexes already cover both queries.

### Give both definition families one audit interaction

`DefinitionRevisionLedger` receives only the common immutable evidence shape and does not own fetching or mutation. Each editor requests 10, appends the disjoint older page, preserves visible rows on error and disables the explicit continuation action in flight. The component labels create/correct/archive, revision and time without ranking the content.

The food editor retains its existing inline location. The action editor now loads history when correcting an owner entry; creating a new entry has no artificial empty ledger. Closing the editor clears its history state, and all catalog writes continue through the existing optimistic revision and snapshot rules.

### Treat route growth as measured debt

The shared component removed duplicate food styling/formatting, but exposing action history still added real state and rendering to the workouts route. Reviewed ceilings moved narrowly from H5 `2,440,000` total / `207,000` async to `2,450,000` / `207,200`, and from WeApp `803,000` total / `49,200` page to `806,000` / `50,500`. Entry and vendor ceilings remain unchanged. Moving action-definition management to a dedicated lazy route is retained as the next structural bundle optimization, not mixed into this pagination round.

## 4. Validation evidence

- Focused exercise/food PostgreSQL validation passed 2 files / 4 tests. It proves bounded first/older pages, a concurrent archive head, fresh archived history, cross-owner concealment, cross-entry and missing-anchor rejection, invalid limits and unchanged workout/meal snapshots plus export history.
- Repository-wide unit validation passed 61 files / 268 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict TypeScript, repository formatting, generated OpenAPI, API production build, H5 production build and WeApp production build passed.
- Main browser validation passed 40/40 and dedicated OIDC passed 3/3, for 43 browser cases. Food revisions R1–R12 load as 10 plus 2 and end explicitly; the action lifecycle visibly reads R1 and then R2/R1 after correction.
- Client quality measured H5 `2,444,950` total bytes, `318,996` entry bytes and `207,085` largest async JavaScript; WeApp `805,714` total bytes, `18,915` vendor bytes and `50,338` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-048-progressive-definition-revisions-mobile.png`.

## 5. Problems found and experience captured

- An API can maintain audit history while the product still hides it. Transport completeness and user-visible correction evidence must both be reviewed.
- Definition snapshots share a small common audit projection even though their full schemas differ. A view component should depend on that projection rather than know nutrition or exercise fields.
- Cross-entry cursor validation matters even when both entries belong to valid users. A well-formed token is not valid for a different route resource.
- Exact-anchor validation prevents fabricated high revisions from skipping owner evidence.
- Archive is a new head revision, not a reason to invalidate an older cursor or remove history access.
- Reusing the database index is safer than adding redundant migrations; query plans should drive schema changes.
- A quality ceiling should make page growth visible. This round extracted shared presentation, measured remaining product value and recorded the embedded workouts editor as explicit split debt.

## 6. Global state review, remaining risks and next step

Current record collections, their aggregate histories and the two user-definition histories are now bounded and progressively reachable. Source audit found one remaining direct unbounded revision query: weekly-plan history. Its structured plan snapshots are larger than the definition rows and can grow through regeneration and user decisions.

Iteration 049 should page weekly-plan history with the same minimal revision cursor and progressive Week Fold history surface, while preserving freshness projection, decision labels, exact plan owner scope and immutable snapshot semantics. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 047 archive](047-stable-revision-history-pagination.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API contract guide](../api/README.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [ADR-0037](../architecture/decisions/0037-user-owned-food-catalog.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0046](../architecture/decisions/0046-stable-definition-history-pagination.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
