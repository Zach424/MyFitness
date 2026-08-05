# Iteration 065: Health-record ledger read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the health-record ledger's first and foreground-refresh reads. Acceptance requires unknown versus successful-empty distinction across both the recent log and seven-entry trend, an accepted page/cursor snapshot, a retained but labeled page after refresh failure, frozen create/correction/history/pagination/delete operations while authority is uncertain, product-owned failure families, one explicit keyboard-operable retry and real API proof at mobile and wide viewports.

The round adds no API/schema/database change, polling, persistent health-record cache, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `record.model.ts` owns five read phases and four failure families without React, Taro or network dependencies; three new read-state cases join the existing draft/request model tests for 8/8 focused checks.
- The first page and continuation cursor are accepted together. A successful empty page has an explicit marker independent from the initial empty array.
- Initial failure renders an amber ledger-authority card, `—/7` trend count and unknown log state. A failed later check retains the exact loaded page beneath a `RETAINED PAGE` label.
- Save, correction, history open/continuation, list continuation and deletion all require `ready` authority at disabled-semantic and handler levels. Draft fields, back, progress photos and independently read long-term observations remain available.
- Two reviewed artifacts cover a settled, overflow-free 390 × 844 initial offline state and a 1440 × 1000 refused refresh retaining one confirmed 71.8 kg record.

## 3. Implementation method

### Separate accepted emptiness from the default array

One guarded loader stages the strict 20-item page and cursor before accepting both. `hasReadSnapshot` controls whether the log/trend may describe zero entries, while a framework-free phase function derives initial loading, ready, refreshing, initial error and stale. The unload activity guard prevents late responses from publishing into an unmounted Taro page.

### Retain evidence while revoking permission to act

A foreground refresh leaves the accepted records and cursor in page memory. During the request and after a failure, the list and trend stay visible under a clear authority rail. `readAuthorityReady` freezes every list-dependent mutation and audit continuation, and refresh closes already-open history/delete contexts; in-progress user input is not discarded.

### Keep recovery language and activation bounded

Transport, 4xx, 5xx and unexpected failures map to product-owned Chinese copy. The single retry receives delayed H5 focus and shares the explicit pointer/Enter/Space adapter. The normal `更新记录` control is visible only while the ledger is ready or actively refreshing; no interval, cache or background action is introduced.

### Rebaseline only measured total growth

H5 total moves from 2,624,965 to 2,632,737 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 912,623 to 921,287, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,634,000 H5 total and 922,000 WeApp total.

## 4. Validation evidence

- Focused record-page model validation passed 8/8 tests, including three read-authority cases.
- Repository-wide unit validation passed 68 files / 345 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and diff whitespace checks passed.
- The complete main H5 browser suite passed 62/62 in 2.4 minutes, including both new fault/retry scenarios. The dedicated OIDC suite passed 3/3; the repository now retains 65 browser tests.
- Normal H5, OIDC H5, WeApp, administrator and API production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,632,737 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 921,287, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-065-record-initial-offline-mobile.png` and `iteration-065-record-stale-wide.png`.

## 5. Problems found and experience captured

- Adding a global warning is insufficient if a nested log panel still branches directly on an empty array. The first browser assertion caught that the old “no records” copy remained below the new authority card; log and trend branches now share the accepted-snapshot boundary.
- Refreshing must not temporarily replace retained evidence with a loading placeholder. Loading is presentation state; accepted data remains the visible snapshot until a new complete response succeeds.
- Freezing only the visible record-card buttons misses history continuation and already-open modal contexts. Read start now closes history/delete surfaces and every continuation handler independently requires authority.
- User input is not server authority. It can remain editable and locally recoverable while save stays frozen; a correction still carries its exact base revision after revalidation.
- The first mobile capture again exposed Taro's horizontal route transition. Evidence now waits for the record page's actual left boundary and proves no horizontal overflow before capture.
- Browser tests consume built H5 assets; the first targeted run intentionally failed against the old bundle, then passed after rebuilding. Source assertions were not weakened to hide the stale build.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-065 artifacts remain.

## 6. Global state review, remaining risks and next step

The health-record ledger now protects current-list interpretation and mutations with local response authority while retaining no new sensitive state outside page memory. It still has no durable offline cache, server snapshot token, real-radio/WeChat proof, cross-device behavior or hosted exact-SHA evidence. Those are not inferred from browser interception.

Iteration 066 should audit the workout ledger's list authority before create, correction, history, deletion and owner-action reuse. It should prevent an initial list failure from appearing as an empty training log, retain a labeled last successful page only in memory, freeze mutations until authority returns and prove explicit recovery without cloud or real-provider input. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 064 archive](064-privacy-custody-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0002](../architecture/decisions/0002-health-record-contract.md)
- [ADR-0004](../architecture/decisions/0004-health-record-revision-lifecycle.md)
- [ADR-0044](../architecture/decisions/0044-stable-record-list-pagination.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0060](../architecture/decisions/0060-health-record-ledger-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
