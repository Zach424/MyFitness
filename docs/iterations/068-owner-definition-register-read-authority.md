# Iteration 068: Owner-definition register read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the dedicated owner-food and owner-action definition registers as independent mutable-directory authorities. Acceptance requires unknown versus successful-empty distinction, a retained but labeled in-memory snapshot after refresh failure, frozen create/correction/history/archive/save operations while authority is uncertain, product-owned failure families, explicit keyboard-operable refresh/retry and real API proof for both variants at mobile and wide viewports.

The round adds no API/schema/database change, persistent catalog cache, polling, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `register-read.ts` owns five read phases, four failure families and food/action product copy without React, Taro or network dependencies; two focused tests cover every phase and failure class.
- Both register routes publish an owner-definition list and count only after their catalog request succeeds. Initial failure renders em-dash counts and a deliberate unknown list instead of the former false empty register.
- A failed foreground refresh keeps the exact accepted definitions visible below an amber authority receipt, but disables new/edit/save/archive/confirmation operations and guards the handlers themselves.
- Initial route focus now follows the read result after the H5 transition: success returns to the back action and failure lands on retry. Later failed refreshes focus retry without disturbing the retained definitions.
- Two reviewed artifacts cover a settled, overflow-free 390 × 844 initial offline action register and a 1440 × 1000 refused food refresh retaining one definition.

## 3. Implementation method

### Give each mutable register one explicit boundary

One guarded foreground loader per route reads the existing combined starter/owner catalog, derives the active custom definitions and accepts the owner list only after success. `hasReadSnapshot` controls whether zero and empty language may appear, while a shared framework-free phase function derives initial loading, ready, refreshing, initial error and stale. An activity guard prevents a late request from publishing after unmount.

### Retain evidence without authorizing writes

Refreshing does not clear the last accepted list. If the request fails, the list remains readable under an authority receipt that names the accepted definition count and failure family. `readAuthorityReady` is required by create/edit, save, archive request/confirmation and older-history continuation; disabled semantics and handler guards agree. A failed read never opens a requested deep-linked definition, while a successful first read may open the exact accepted owner entry.

### Keep recovery bounded and product-owned

Transport, 4xx, 5xx and unexpected failures map to register-specific Chinese copy. The only recovery is an explicit foreground request protected against concurrent calls. Back navigation remains available, no raw backend message reaches the authority card and no sensitive definition list is written to a new cache.

### Rebaseline only measured total growth

H5 total moves from 2,649,451 to 2,658,138 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 941,234 to 951,047, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,659,000 H5 total and 952,000 WeApp total.

## 4. Validation evidence

- Focused register-state validation passed 2/2 tests; repository-wide unit validation passed 69 files / 353 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- The complete main H5 browser suite passed 68/68 in 2.9 minutes, including both new register fault/retry scenarios and every existing definition lifecycle. The dedicated OIDC suite passed 3/3; the repository now retains 71 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,658,138 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 951,047, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-068-action-register-offline-mobile.png` and `iteration-068-food-register-stale-wide.png`.

## 5. Problems found and experience captured

- A default empty array is not harmless presentation state on a mutable definition page: it can both claim “no definitions” and authorize a write against an unverified directory.
- The general catalog endpoint contains starter and owner definitions, so the accepted register snapshot is the custom-definition projection of one successful response, not a separate partial call.
- Retained definitions are useful for recognition during an outage, but their revision and active status are not current authority. Correction, history continuation and archive must freeze together with create.
- The initial route transition briefly places the incoming page outside the viewport. Visual evidence must wait for the settled page boundary; otherwise a correct responsive layout can look horizontally clipped.
- The action route previously scheduled unconditional back-button focus. That timer could overwrite a newly rendered failure retry. Focus must be selected from the accepted read outcome, while successful deep links preserve the established back-button contract.
- Shared disabled styling must preserve the existing 0.45 opacity contract because browser tests intentionally treat that visual cue as part of the recoverable-workbench semantics.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-068 artifacts remain.

## 6. Global state review, remaining risks and next step

The recording ledgers and their dedicated mutable-definition registers now distinguish unverified reads from server-confirmed empty results. The registers retain no new sensitive state outside page memory and still rely on the existing snapshot-on-use rule so later definition edits cannot rewrite recorded meals or workouts.

The three long-term observation routes remain the next local read-boundary gap: health and exercise first read a source ledger to derive choices and then read an insight, while nutrition reads one projection directly. Their raw failures and default empty choices can still collapse unavailable evidence into an empty or partially selected observation. Iteration 069 should give these read-only projections explicit initial/refresh authority and product-owned retry without adding targets, diagnoses, prescriptions or durable caches. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 067 archive](067-nutrition-ledger-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0037](../architecture/decisions/0037-user-owned-food-catalog.md)
- [ADR-0048](../architecture/decisions/0048-user-definition-revision-history-pagination.md)
- [ADR-0052](../architecture/decisions/0052-sensitive-workbench-failure-recovery.md)
- [ADR-0063](../architecture/decisions/0063-owner-definition-register-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
