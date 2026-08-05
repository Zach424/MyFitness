# Iteration 054: Workout and meal save recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round extends the accepted ambiguous-create recovery contract from health records to workout and meal creates. Acceptance requires both editors to retain their complete page-owned drafts after the real service commits and the response is lost, distinguish transport/service uncertainty from server refusal, keep an enabled retry action, reuse one non-empty idempotency key only for an unchanged payload and finish with exactly one workout or meal aggregate.

The round adds no offline/background queue, persisted request key/payload, API, migration, provider, cloud service, credential, dataset, photo replay, diagnosis, nutrition target or training prescription.

## 2. Structure, technology and design state

- `pages/workouts` and `pages/nutrition` import the existing dependency-free `SaveRecovery`/`describeSaveFailure` contract rather than copying error classification.
- Each page owns one recovery state beside its existing draft and in-memory request-key ref. Pure retry retains the key; every meaningful payload mutation clears recovery/key.
- Workout invalidation includes title, both occurrence fields, timezone/offsets, exercise/set structure and values, load unit, fatigue, pain and note.
- Meal invalidation includes meal type/title, occurrence/timezone/offset, manual or photo-confirmed items, portions, removal and note. Photo media and unconfirmed candidates remain in the private workbench and outside replay.
- Both recovery cards reuse the iteration-053 warning/eyebrow/mineral-action grammar. The meal disabled selector now matches only Taro `disabled="true"`.
- The APIs, PostgreSQL uniqueness/request-hash authority, local draft schema and all correction behavior remain unchanged.

## 3. Implementation method

### Reuse one semantic contract

Transport interruption maps to an unknown result, retryable HTTP status to a service outage, other HTTP status to refusal and an unclassified adapter failure to safe uncertainty. Both pages pass only their aggregate label and create/correction mode, so message and retry semantics cannot drift.

### Audit the complete payload, not only obvious text fields

Existing code cleared keys for time and most set edits but missed workout load unit/fatigue/pain/note and meal type/title/items/portions/note. One page-local `invalidatePendingSave` function now resets key, recovery and stale feedback for every payload-changing handler. Catalog search, tabs and favorites do not alter the submitted snapshot and therefore do not create a new request identity.

### Exercise the real committed-but-lost window twice

Each Playwright test intercepts only its create POST. The first request goes upstream and must return `201`; the route then aborts only the browser response. The editor must keep its named draft and facts, show the uncertain status, show zero ledger entries and expose a full-opacity enabled retry. The second request continues with the exact first key; the final ledger must contain one matching aggregate.

### Preserve operation boundaries

Retry remains user initiated and in memory. Corrections continue to rely on expected revision rather than create idempotency. Photo consent/upload/confirmation/deletion and action archive/update are not automatically replayed; iteration 055 will classify those stages by authority before adding recovery behavior.

### Rebaseline only measured growth

The old gate rejected H5 total 2,429,088 against 2,424,000. Measurement showed H5 entry/async and WeApp vendor unchanged, while totals and the workout page grew. Only H5 total, WeApp total and largest-page ceilings move to 2,430,000, 829,000 and 40,500 bytes.

## 4. Validation evidence

- Focused recovery/workout/nutrition model validation passed 3 files / 22 tests.
- Repository-wide unit validation passed 64 files / 289 tests.
- Strict workspace TypeScript and repository formatting passed.
- Focused committed-response-loss browser validation passed 2/2 tests.
- The complete main H5 browser suite passed 43/43 tests in 2.1 minutes.
- H5 and WeApp production builds passed. Known non-blocking Taro cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,429,088 bytes, entry 318,996 and largest async JavaScript 186,481; WeApp total 828,519, vendor 18,915 and largest page 40,229 (`pages/workouts`). Forbidden runtime-marker scans are empty.
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-054-workout-save-recovery-mobile.png` and `iteration-054-meal-save-recovery-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, database, identity, prompt, validator and worker code did not change. Both browser tests exercised real unchanged API/PostgreSQL idempotency paths.

## 5. Problems found and experience captured

- Request-key reset audits must follow the serialized payload, not grep only the existing reset calls. Several less prominent controls changed request data without invalidating the key.
- A shared classifier is insufficient without page-specific mutation coverage. Each editor needs one explicit invalidation boundary that every payload handler uses.
- Taro again rendered `disabled="false"` as an attribute. The meal button's old presence selector made enabled actions translucent; exact-value CSS plus opacity assertions prevents recurrence in this flow.
- Real lost-response tests are stronger than an offline toggle: upstream commit proves the retry must rely on server idempotency rather than assuming the first request never arrived.
- The first quality verification correctly failed the old totals. Only the three measured dimensions were adjusted; entry, async and vendor budgets remain fixed.
- Full E2E refreshed historical screenshots, including iteration 053. All tracked test-generated changes were restored; only the two new iteration-054 artifacts remain.

## 6. Global state review, remaining risks and next step

All three core manual create editors now have locally reproduced duplicate-safe unknown-result recovery. This does not prove physical radio transitions or WeChat device behavior, and it deliberately does not generalize create semantics to correction, deletion or media workflows. Sensitive workbenches have multiple authority changes—reservation, upload, confirmation, archive and deletion—that need stage-specific recovery rather than one generic retry.

Iteration 055 should classify the lazy action register and food-photo workbench stages as safely retryable, reconciliation-required or terminal. It may reuse an unchanged action-create key, but must not auto-replay archive, upload, candidate confirmation or deletion; confirmed facts must stay separate from uncertain operations and photos must stay outside drafts/background sync. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 053 archive](053-ambiguous-health-record-save-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0040](../architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [ADR-0051](../architecture/decisions/0051-ambiguous-create-response-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
