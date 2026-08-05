# Iteration 062: Today read resilience

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the Today entry surface against initial and refresh read failures. Acceptance requires unknown versus successful-empty distinction, last-successful snapshot retention, offline/HTTP-refusal/service/unknown copy, one non-concurrent foreground retry, no polling or persistent health-data cache, keyboard focus recovery and real API proof at mobile and wide viewports.

The round adds no offline database, service worker, background synchronization, optimistic health fact, mutation replay, API/schema/database change, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `today-read.model.ts` is a dependency-free presentation contract for five phases and four failure families; three focused Vitest cases lock its authority boundaries.
- Today reads its dashboard and weekly-plan list as one snapshot pair. Only a complete success replaces both; a failed refresh keeps the preceding pair in React page memory.
- Initial loading and initial error never render real empty-state copy or numeric zero evidence. Counts and trends use em dashes until one successful dashboard exists.
- A compact top-bar refresh and one state-card retry reuse the shared Taro pointer/Enter/Space adapter and concurrent-call guard. The initial-error retry receives delayed H5 focus.
- Two reviewed artifacts cover a 390 × 844 initial offline state and a 1440 × 1000 refused refresh retaining one confirmed record.

## 3. Implementation method

### Separate response authority from domain emptiness

The page derives `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` from snapshot presence, active read and failure presence. `rail.length === 0` can now mean an empty day only after `dashboard` exists. Before that, the hero, evidence count and all trend values remain explicitly unknown.

### Retain one atomic in-memory snapshot

A ref records the last accepted dashboard while the rendered dashboard/plans remain unchanged until both new requests succeed. A rejected refresh therefore cannot partially replace plan reconciliation or dashboard evidence. The page makes no promise after process loss and writes no sensitive data to storage.

### Own failure language without raw server leakage

Transport/mini-program request failures map to offline, 4xx to refused, 5xx to service unavailable and unexpected shapes to unknown. Copy states whether a prior snapshot remains and never describes a failed read as empty, synchronized or newly current.

### Keep retry explicit and accessible

The top-bar action supports manual refresh in normal operation. During a read, both it and any retry publish disabled semantics and event guards. Initial failure moves H5 focus to the retry; refresh failure preserves the caller's context. Neither state schedules polling or a background call.

### Rebaseline measured entry-surface growth only

H5 total moves from 2,606,897 to 2,612,535 bytes and entry from 319,232 to 319,236; largest async JavaScript remains 199,198. WeApp total moves from 891,134 to 898,132 while vendor/largest page remain 18,915/49,800. Budgets move only to 2,613,000 H5 total and 899,000 WeApp total.

## 4. Validation evidence

- Focused read-state validation passed 3/3 tests.
- Repository-wide unit validation passed 67 files / 336 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict workspace TypeScript and repository formatting passed.
- The complete main H5 browser suite passed 56/56 in 2.6 minutes, including both new fault/retry scenarios. The dedicated OIDC suite passed 3/3; the repository now retains 59 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,612,535 bytes, entry 319,236 and largest async JavaScript 199,198; WeApp total 898,132, vendor 18,915 and largest page 49,800 (`pages/plans`). Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-062-today-initial-offline-mobile.png` and `iteration-062-today-stale-wide.png`.

## 5. Problems found and experience captured

- UI defaults can turn read failure into false factual absence even when no data is overwritten. Empty state must require positive response authority, not merely an empty array fallback.
- Leaving React state untouched is useful but insufficient snapshot recovery. The UI must label that a refresh failed and that the retained facts are from the preceding successful read.
- `Promise.all` protects atomic presentation only if state assignment occurs after both responses; partial success must not leak into plan-versus-actual reconciliation.
- Browser-simulated network and 429 responses correctly emit Chromium resource errors. Tests exclude only the exact injected fault while retaining all other console/page-error assertions.
- Taro custom buttons require explicit concurrent-call event guards in addition to disabled appearance. Initial-error focus makes the retry operable without a new pointer search.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-062 artifacts remain.

## 6. Global state review, remaining risks and next step

Today now has reliable local response authority without expanding sensitive-data retention. It still has no durable offline cache, snapshot timestamp, cross-device behavior, real-radio/WeChat proof or hosted exact-SHA evidence. Those are intentionally not inferred from browser interception.

Iteration 063 should audit Week Fold read authority. It should distinguish “not read” from “no plan”, retain one last successful plan/revision/history snapshot after refresh failure, freeze mutations and provider calls until authority returns, expose one accessible retry without polling and prove mobile/wide recovery through the real local API. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 061 archive](061-ai-explanation-history.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0007](../architecture/decisions/0007-server-dashboard-aggregation.md)
- [ADR-0034](../architecture/decisions/0034-explicit-plan-workout-link.md)
- [ADR-0057](../architecture/decisions/0057-today-read-snapshot-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
