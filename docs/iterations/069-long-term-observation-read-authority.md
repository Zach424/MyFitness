# Iteration 069: Long-term observation read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the health, exercise and nutrition long-term observation routes as explicit read-only authorities. Acceptance requires complete atomic publication of health/exercise source choices plus selected projection, successful-response-only empty/zero language, retained but labeled in-memory projections after refresh failure, frozen server-backed choice changes, still-usable local windows/nutrient views, product-owned failure families, accessible foreground recovery and real API proof across all three variants.

The round adds no API/schema/database change, stored trend copy, diagnosis, normal range, goal, adherence score, training progression, dietary advice, polling, persistent cache, background synchronization, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `observation-read.ts` owns five phases, four failure families and health/exercise/nutrition product copy without React, Taro or network dependencies; two focused tests cover every phase and failure family.
- One shared lazy `ObservationReadToolbar`/`ObservationReadState` component renders the quiet evidence note, explicit update, ruled amber/blue authority receipt, retained extent and one retry without moving the safety boundary into page-specific ad hoc errors.
- Health and exercise now stage the source list, derived selection and corresponding insight, then publish all three together. Nutrition accepts its 90-day projection as one unit.
- Refresh/selection failure keeps the last accepted projection. Health/exercise service choices freeze, while local 7/30/90-day windows and nutrition nutrient tabs remain usable because they only derive from retained response data.
- Two reviewed artifacts cover a settled, overflow-free 390 × 844 initial offline health observation and a 1440 × 1000 refused nutrition refresh retaining one recorded day and a locally selected 7-day view.

## 3. Implementation method

### Remove two-stage partial publication

Each health/exercise loader resolves a candidate identity from either a freshly derived source list or the last accepted choices, awaits the matching insight and assigns choices, selected identity, insight and snapshot flag only after the complete chain succeeds. A successful empty source list is accepted without an insight request. Failed selection intent stays in one in-memory ref so retry reaches the intended identity while the visible projection remains unchanged.

Nutrition uses the same phase boundary around its single projection request. Unmount and concurrent-call guards prevent late or overlapping foreground reads from publishing.

### Preserve local exploration without claiming freshness

During refresh and stale phases, the accepted insight remains the render source. `METRIC … · POINTS …`, `MOVEMENT … · SESSIONS …` or `LOCAL DAYS 90` states exactly what is retained. Health/exercise identity buttons and ordinary refresh carry disabled semantics and guarded callbacks; local time-window and nutrition-metric changes stay live because they do not contact the server or alter facts.

### Make unknown and recovery product-owned

Before the first accepted response, each card renders an explicit “尚未核对” state and no legitimate empty guidance, source choice, zero summary or missing-day ribbon. Transport, 4xx, 5xx and unknown failures map to bounded Chinese copy rather than raw backend messages. Initial success and failure choose their focus destination after the H5 transition; later failure lands promptly on retry.

### Rebaseline only measured lazy-route growth

H5 total moves from 2,658,138 to 2,681,179 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 951,047 to 963,138, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,682,000 H5 total and 964,000 WeApp total.

## 4. Validation evidence

- Focused observation-state/model validation passed 4 files / 8 tests; repository-wide unit validation passed 70 files / 355 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Six targeted browser checks passed for all three existing observation lifecycles plus the three new fault/retry scenarios.
- The complete main H5 browser suite passed 71/71 in 3.1 minutes. The dedicated OIDC suite passed 3/3; the repository now retains 74 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,681,179 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 963,138, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-069-health-observation-offline-mobile.png` and `iteration-069-nutrition-observation-stale-wide.png`.

## 5. Problems found and experience captured

- A two-effect loader can violate atomicity even when both requests are read-only: publishing choices before their projection lets the selector imply authority the page has not yet earned.
- An empty source ledger is a complete observation result only after that source request succeeds. Initial `[]` state must not be reused as product evidence.
- Server identity changes and local projection views are different risk classes. Freezing the former while retaining the latter avoids both mixed evidence and an unnecessarily dead read-only page.
- A failed identity switch needs one bounded in-memory intent; clearing it prevents faithful retry, while publishing it early visually mislabels the retained projection.
- Product-owned failure copy is especially important on health/nutrition pages because raw status text can be mistaken for evidence or advice.
- The wide nutrition screenshot initially inherited the inner `ScrollView` position after selecting 7 days. Resetting that scroll container before capture preserves the full masthead/authority/projection hierarchy; `fullPage` alone does not reset nested scroll state.
- Testing retry focus must happen before intentionally clicking a still-safe local window control, since that user action correctly moves focus away from retry.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-069 artifacts remain.

## 6. Global state review, remaining risks and next step

All main recording surfaces, mutable definition registers and dedicated long-term observation routes now distinguish unknown, successful-empty, refreshing, retained-stale and ready states. Observation projections remain derived on demand from current confirmed records, retain no new durable sensitive copy and preserve their non-diagnostic/non-prescriptive contracts.

The next local authority gap is the private-photo workbench family. Food-photo candidates and progress-photo inventories both initialize from absent values and can expose an empty/review state or leave comparison/delete/confirm controls without an accepted current private list after read failure. Iteration 070 should harden initial/refresh inventory authority, retain only page-memory proof, freeze inventory-dependent media/custody actions and keep file selection/media replay outside recovery. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 068 archive](068-owner-definition-register-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0036](../architecture/decisions/0036-stable-key-exercise-insights.md)
- [ADR-0038](../architecture/decisions/0038-timezone-safe-nutrition-observation.md)
- [ADR-0039](../architecture/decisions/0039-exact-metric-health-observation.md)
- [ADR-0064](../architecture/decisions/0064-long-term-observation-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
