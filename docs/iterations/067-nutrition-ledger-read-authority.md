# Iteration 067: Nutrition meal-desk read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the meal ledger, favorites and food directory as one recording authority. Acceptance requires unknown versus successful-empty distinction across all three reads, atomic acceptance of the first meal page/cursor plus favorites and food catalog, a retained but labeled complete snapshot after refresh failure, frozen create/repeat/correction/history/pagination/delete/food/favorite operations while authority is uncertain, product-owned failure families, one explicit keyboard-operable retry and real API proof at mobile and wide viewports.

The round adds no API/schema/database change, polling, persistent meal/catalog cache, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `nutrition.model.ts` owns five read phases and four failure families without React, Taro or network dependencies; three new cases join the existing meal model tests for 9/9 focused checks.
- The first meal page/cursor, favorites and food catalog are staged concurrently and accepted only after all three complete. No partial response can replace one portion of the previous meal desk.
- Initial failure renders an amber authority receipt with `MEALS / FAVORITES / FOODS` shown as em dashes, unknown meal/catalog states and non-zero-safe tab labels. A failed later check retains the exact three counts.
- Save, repeat, correction, history open/continuation, list continuation, deletion, food selection/custom correction and favorite mutation all require `ready` authority at disabled-semantic and handler levels. Draft fields, photo proof, the general owner-food register and nutrition observations remain available.
- Two reviewed artifacts cover a settled, overflow-free 390 × 844 initial offline state and a 1440 × 1000 refused favorite refresh retaining one meal, one favorite and ten foods.

## 3. Implementation method

### Accept one three-source meal desk

One guarded foreground loader issues the strict 20-item meal request, favorite request and food-catalog request together. It assigns meals, cursor, favorites and foods only after `Promise.all` succeeds. `hasReadSnapshot` controls whether the ledger, tabs or picker may describe zero entries, while a framework-free phase function derives initial loading, ready, refreshing, initial error and stale. The unload activity guard prevents late responses from publishing into an unmounted Taro page.

### Retain evidence while freezing dependent choices

A foreground refresh leaves the accepted meals, cursor, favorites and food definitions in page memory. During the request and after a failure, all remain visible under one three-source authority receipt. `readAuthorityReady` freezes every list-dependent mutation and continuation, while refresh closes already-open history/delete contexts and preserves the complete unsaved draft.

Photo review remains available because it produces only confirmed inputs for an unsaved draft; it cannot bypass the frozen meal save. The owner-food register and nutrition observation route also own independent reads and remain reachable.

### Keep recovery language and activation bounded

Transport, 4xx, 5xx and unexpected failures map to product-owned Chinese copy. The single retry receives delayed H5 focus and shares the explicit pointer/Enter/Space adapter. Returning from photo review restores focus only after the composed page read succeeds. No timer, persistent cache or background action is introduced.

### Rebaseline only measured total growth

H5 total moves from 2,640,904 to 2,649,451 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 931,007 to 941,234, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,651,000 H5 total and 942,000 WeApp total.

## 4. Validation evidence

- Focused nutrition-page model validation passed 9/9 tests, including three read-authority cases.
- Repository-wide unit validation passed 68 files / 351 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and diff whitespace checks passed.
- The complete main H5 browser suite passed 66/66 in 2.7 minutes, including both new fault/retry scenarios and every existing meal/favorite/definition/photo lifecycle. The dedicated OIDC suite passed 3/3; the repository now retains 69 browser tests.
- Normal H5, OIDC H5, WeApp, administrator and API production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,649,451 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 941,234, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-067-nutrition-initial-offline-mobile.png` and `iteration-067-nutrition-stale-wide.png`.

## 5. Problems found and experience captured

- The meal editor had three authorities, not two: recent food is derived from meals, favorites have their own mutable endpoint and catalog definitions refresh on every route show. Accepting only meals plus favorites still leaves a mixed-age picker.
- Zero-count source tabs can make a false server claim even when the main ledger avoids its empty state. `我的 / 收藏 / 最近` now use em dashes until the complete snapshot is accepted.
- A confirmed photo handoff remains local draft input, not permission to save. Keeping photo review open during a ledger outage preserves useful work without letting AI-derived candidates cross the confirmed-fact boundary.
- Favorite add/remove consumes both the selected draft snapshot and current favorite list, so it must freeze along with meal save even though its endpoint is separate.
- The three-column source strip is not decoration: it exposes exactly which accepted lists are retained and prevented the wide warning from reading like a meal-only error.
- The mobile capture waits for the nutrition page's actual left boundary and proves no horizontal overflow before recording evidence.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-067 artifacts remain.

## 6. Global state review, remaining risks and next step

The nutrition recording surface now protects list interpretation and every snapshot-dependent mutation with one local composed authority while retaining no new sensitive state outside page memory. It still has no durable offline cache, server snapshot token spanning three endpoints, real-radio/WeChat proof, cross-device behavior, licensed food source or hosted exact-SHA evidence. Those are not inferred from browser interception.

Iteration 068 should audit the dedicated owner-food and owner-action registers themselves. Their independent read boundaries currently justify keeping the routes reachable, but must not turn an initial catalog failure into a false empty register or enable correction/archive against an unverified current definition. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 066 archive](066-workout-ledger-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0006](../architecture/decisions/0006-nutrition-snapshot-aggregate.md)
- [ADR-0037](../architecture/decisions/0037-user-owned-food-catalog.md)
- [ADR-0038](../architecture/decisions/0038-timezone-safe-nutrition-observation.md)
- [ADR-0044](../architecture/decisions/0044-stable-record-list-pagination.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0049](../architecture/decisions/0049-lazy-food-photo-proof-workbench.md)
- [ADR-0062](../architecture/decisions/0062-nutrition-ledger-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
