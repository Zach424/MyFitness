# Iteration 066: Workout ledger and action-directory read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the workout ledger and embedded action directory as one recording authority. Acceptance requires unknown versus successful-empty distinction across both reads, atomic acceptance of the first workout page/cursor plus exercise catalog, a retained but labeled complete snapshot after refresh failure, frozen create/repeat/correction/history/pagination/delete/catalog operations while authority is uncertain, product-owned failure families, one explicit keyboard-operable retry and real API proof at mobile and wide viewports.

The round adds no API/schema/database change, polling, persistent workout/catalog cache, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `workout.model.ts` owns five read phases and four failure families without React, Taro or network dependencies; three new read-state cases join the existing request/draft model tests for 10/10 focused checks.
- The first workout page/cursor and exercise catalog are staged concurrently and accepted only after both complete. Neither partial response can replace half of the previous snapshot.
- Initial failure renders an amber ledger-authority card, unknown retained count and unknown log/catalog states. A failed later check retains the exact accepted workout and catalog beneath a `RETAINED SNAPSHOT` label.
- Save, quick/card repeat, correction, history open/continuation, list continuation, deletion, catalog selection and custom-action correction all require `ready` authority at disabled-semantic and handler levels. Draft fields, back, the general owner-action register and independently read exercise observations remain available.
- Two reviewed artifacts cover a settled, overflow-free 390 × 844 initial offline state and a 1440 × 1000 refused catalog refresh retaining one workout and nine actions.

## 3. Implementation method

### Accept a composed recording snapshot

One guarded foreground loader issues the strict 20-item workout request and catalog request together. It assigns workout rows, cursor and actions only after `Promise.all` succeeds. `hasReadSnapshot` controls whether either panel may describe zero entries, while a framework-free phase function derives initial loading, ready, refreshing, initial error and stale. The unload activity guard prevents late responses from publishing into an unmounted Taro page.

### Retain both halves while revoking permission to act

A foreground refresh leaves the accepted workouts, cursor and actions in page memory. During the request and after a failure, both remain visible under one authority rail. `readAuthorityReady` freezes every list-dependent mutation, audit continuation and action reuse path; refresh closes already-open history/delete contexts while keeping in-progress user input and correction provenance.

The dedicated owner-action register remains reachable because it owns its own server read and does not act on the uncertain composed snapshot. Exercise trend links remain reachable for the same reason.

### Keep recovery explicit and bounded

Transport, 4xx, 5xx and unexpected failures map to product-owned Chinese copy. The single retry receives delayed H5 focus and shares the explicit pointer/Enter/Space adapter. Return from the owner-action route restores catalog focus only after the combined snapshot succeeds. No timer, persistent cache or background action is introduced.

### Rebaseline only measured total growth

H5 total moves from 2,632,737 to 2,640,904 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 921,287 to 931,007, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,642,000 H5 total and 932,000 WeApp total.

## 4. Validation evidence

- Focused workout-page model validation passed 10/10 tests, including three read-authority cases.
- Repository-wide unit validation passed 68 files / 348 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and diff whitespace checks passed.
- The complete main H5 browser suite passed 64/64 in 2.7 minutes, including both new fault/retry scenarios. The dedicated OIDC suite passed 3/3; the repository now retains 67 browser tests.
- Normal H5, OIDC H5, WeApp, administrator and API production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,640,904 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 931,007, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-066-workout-initial-offline-mobile.png` and `iteration-066-workout-stale-wide.png`.

## 5. Problems found and experience captured

- Two requests rendered in one editor need one acceptance boundary. Updating the workout list before the catalog completed would still permit a mixed-age recording surface, even if each panel had its own loading flag.
- Empty arrays are implementation defaults, not evidence. Both the training log and action directory must branch on accepted response authority before they may use empty-state language.
- Freezing the primary save button is insufficient: quick repeat, card repeat, correction, revision continuation, deletion and custom action reuse all consume the same snapshot and require independent handler guards.
- A separate route with its own read authority need not be disabled merely because the parent snapshot is stale. Keeping the owner-action register available avoids turning a bounded authority decision into a global outage claim.
- Taro's disabled button styling made the frozen quick-repeat title nearly disappear even though its accessible name remained. Explicit disabled child colors preserve legibility while event guards enforce inactivity.
- The mobile capture waits for the workout page's actual left boundary and proves no horizontal overflow before recording evidence.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-066 artifacts remain.

## 6. Global state review, remaining risks and next step

The workout recording surface now protects list interpretation and every snapshot-dependent mutation with one local composed authority while retaining no new sensitive state outside page memory. It still has no durable offline cache, server snapshot token spanning both endpoints, real-radio/WeChat proof, cross-device behavior or hosted exact-SHA evidence. Those are not inferred from browser interception.

Iteration 067 should audit the nutrition ledger's current meal page and food/favorite dependencies before meal create/repeat/correction/history/deletion or food reuse. It should prevent an initial read failure from appearing as an empty meal log, retain a visibly labeled last successful composed snapshot only in memory, freeze dependent mutations until authority returns and prove explicit recovery without cloud or real-provider input. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 065 archive](065-health-record-ledger-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0005](../architecture/decisions/0005-workout-aggregate.md)
- [ADR-0030](../architecture/decisions/0030-server-authoritative-workout-completion.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [ADR-0044](../architecture/decisions/0044-stable-record-list-pagination.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0061](../architecture/decisions/0061-workout-ledger-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
