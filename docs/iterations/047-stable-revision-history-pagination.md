# Iteration 047 — Stable revision-history pagination

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The health-record, workout and meal current lists were bounded in iteration 046, but opening one aggregate's audit sheet still selected, transferred and rendered every immutable revision. This round bounds those three revision streams without weakening owner concealment or deleted-aggregate audit access.

Success requires strict shared query/response contracts; a 20-item compatible server default and 50-item maximum; stable newest-first keyset continuation; cursors without health values, chronology or user identifiers; route/owner/exact-revision validation; indexed queries; 10-item progressive client sheets; explicit exhausted/loading behavior; stable traversal when a newer revision or deletion is accepted between pages; OpenAPI coverage; mobile browser proof; and unchanged health-product safety boundaries.

This round adds no cloud service, external provider, dataset, migration, diagnosis, recommendation, total-count query or pagination to definition/plan histories.

## 2. Structure, technology and design state

- Health, workout and nutrition contract modules now expose typed history query and `{ items, nextCursor }` response schemas with a shared strict limit/cursor grammar.
- The three NestJS controllers validate history query strings at the HTTP boundary and document limits, cursors and invalid-request behavior in the generated OpenAPI file.
- The three services reuse the versioned aggregate cursor codec, verify the route UUID plus exact owner revision and execute `revision < boundary ORDER BY revision DESC LIMIT limit + 1`.
- Existing revision indexes already use owner, aggregate UUID and revision descending, so the database shape is unchanged.
- The Taro health, workout and meal sheets request 10 revisions initially, append older pages on an explicit action and show a quiet terminal label when exhausted. Existing page controls and status regions are reused.
- Playwright evidence covers 12 immutable health revisions across two pages at a 390 × 844 viewport.
- ADR-0045, architecture/model/API/design/roadmap/README and the global project status describe the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, parameterized PostgreSQL 18, Vitest and Playwright. No runtime dependency or SQL migration was added.

## 3. Implementation method

### Use the immutable order as the cursor boundary

Each history stream already has one complete order key: its positive revision number. The route reuses the existing base64url `{ v: 1, id, revision }` representation, requires the cursor UUID to equal the path UUID and verifies that exact owner snapshot before applying the boundary. The token therefore remains only a locator; it is neither evidence nor authorization.

Continuation asks only for revisions below the anchor. If revision 5 is added after a caller received revisions 4 and 3, that caller's old cursor still returns 2 and 1; a fresh request returns 5 first. A soft deletion is simply another immutable revision and does not remove the owner aggregate needed to open its history.

### Bound transport and rendering together

The API defaults to 20 and caps at 50, while the interactive sheets deliberately use 10 so opening history stays light. The server reads one extra row to decide whether to emit `nextCursor`; no lifetime total is calculated. A continuation page is strictly older than the existing array, so the client can append it without re-sorting or copying revision identity into a new state model.

Loading is user initiated and temporarily disables the same quiet outline action already established for current-record pagination. Failures use the page's established status surface and preserve the versions already visible. Infinite scroll remains excluded so hidden network work and focus jumps are avoided.

### Keep measured packages within reviewed ceilings

The first implementation exceeded the H5 async and WeApp page ceilings. Reusing each page's existing request state/status surface and removing redundant history-only presentation brought H5 back under its unchanged `207,000`-byte async ceiling. The remaining reviewed product increase moved only WeApp total/page ceilings from `801,000`/`49,000` to `803,000`/`49,200`; H5 total/entry/async and WeApp vendor ceilings stayed unchanged.

## 4. Validation evidence

- Focused contract/service/client validation passed before the full suite. The dedicated PostgreSQL pagination integration now passes 2/2 and proves first/next pages for all three domains, a concurrent new health revision, a workout deletion revision, fresh deleted-workout history, cross-owner concealment, cross-resource cursor rejection and invalid limits.
- Repository-wide unit validation passed 61 files / 268 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict TypeScript passed across all six product/shared workspaces; committed OpenAPI generation, repository formatting and API production build passed.
- Main H5 browser validation passed 39/39 and dedicated OIDC passed 3/3, for 42 browser cases. The new test creates revisions 1–12, proves the 10-row first page, loads the disjoint older suffix and reaches an explicit terminal state.
- H5 and WeApp production builds passed. Client quality measured H5 `2,437,743` total bytes, `318,996` entry bytes and `206,936` largest async JavaScript; WeApp `802,415` total bytes, `18,915` vendor bytes and `49,138` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-047-progressive-revisions-mobile.png`.

## 5. Problems found and experience captured

- Bounding the collection page does not bound a per-aggregate audit stream. Every endpoint whose payload can grow with user time needs an independent review.
- An append-only revision stream does not need the occurrence/creation tuple used by mutable current lists. Reusing the cursor envelope while changing its server interpretation keeps the public grammar small without conflating the two orders.
- Cursor UUID equality must be checked explicitly; a valid cursor from another aggregate is still invalid input even for the same owner.
- Verifying the exact anchor revision prevents a fabricated positive revision from silently skipping evidence.
- A new head revision should not disturb an older continuation. `revision < anchor` gives users a stable suffix while a fresh open remains the way to see new head evidence.
- Existing owner indexes were already sufficient. A migration should follow measured query shape, not be added mechanically to every pagination round.
- Package ceilings worked as intended: the first failure prompted state/style de-duplication before a narrow, evidence-backed WeApp ceiling adjustment.

## 6. Global state review, remaining risks and next step

Current health/workout/meal lists and their per-aggregate revision histories are now bounded and progressively reachable. The next confirmed local growth risk is the owner-created exercise and food definition history pair: both still execute an unbounded `ORDER BY revision DESC` query and render every revision in their correction surfaces.

Iteration 048 should page those two definition-history endpoints and client surfaces with the same minimal revision cursor, archive-safe owner access and bounded progressive UI. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 046 archive](046-stable-record-list-pagination.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API contract guide](../api/README.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0044](../architecture/decisions/0044-stable-record-list-pagination.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
