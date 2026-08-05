# Iteration 059: Plan-workout association recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round applies authority-aware recovery to explicit plan-session/workout link creation and unlink closure. Acceptance requires exact plan/session/workout/link revision authority, visible page-owned relationship intent, frozen competing controls after an ambiguous response, current active-projection reconciliation before any new action, no inferred adherence or automatic migration, narrow closure wording and duplicate-free real API proof for both create and unlink.

The round adds no plan adaptation, adherence score, source-record mutation, medical judgment, API, migration, dataset, model, provider, cloud service, credential, offline queue or background synchronization.

## 2. Structure, technology and design state

- `lib/workbench-recovery.ts` expands from seventeen to nineteen operations with `plan_link` and `plan_unlink`; both require read-side reconciliation and retain only `link_intent`.
- Week Fold stores link create intent as exact plan ID/revision, session date and workout ID/revision. Unlink intent stores plan/link ID, link revision and session date. All remain page-memory only.
- `GET /plans/weekly` is the read boundary because it returns active owner links beside the current plan projection.
- Create recovery accepts only a complete tuple match. Another active session/workout relationship is a conflict; absence is explicitly no success evidence.
- Unlink recovery accepts target ID absence only as “no longer active”. It does not claim the user caused closure because workout deletion and other lifecycle paths can also close links.
- Reconciliation reloads the current plan and returns to the intended session date. It never migrates an old plan-revision link.
- Day leaves, workout choices, link/unlink, plan refresh, substitutions and decisions share guarded pointer/Enter/Space activation with explicit `aria-disabled` during uncertainty.
- Two reviewed 390 × 844 artifacts retain the adopted v2 fold and exact relationship intent under the amber `WRITE ? → READ` strip.

## 3. Implementation method

### Derive creation authority from the complete server tuple

The service already serializes link creation and returns an existing active row only when plan ID/revision, session date, workout ID and bound workout revision all match. It rejects a different link for either the same exact session revision or the same workout. The client nevertheless reads first after response loss so it can show the current relationship instead of hiding a concurrent conflict behind a replay.

### Keep unlink authority narrower than list absence

Unlink closes an active row at its expected link revision and retains reason/timestamp history. The weekly-plan list exposes only active rows. Target absence proves the target is no longer active, but cannot prove that this browser's DELETE caused closure. Recovery copy preserves that limitation and leaves closure history to export/audit evidence.

### Preserve one visible relationship intent

The amber strip names the selected workout, local session date and plan revision for create, or the selected relationship/date for unlink. The same session stays selected after a projection reload. These values are comparison evidence only: they are not persisted and do not authorize a background retry.

### Freeze competing association and plan controls

While the relationship is unknown, day navigation, workout choices, link/unlink, plan refresh, activity substitutions, adoption and skip all remain visible but reject pointer and keyboard callbacks. The foreground read or terminal dismissal is the only live action. CSS keys disabled appearance to explicit `aria-disabled='true'` rather than Taro's bare `disabled` attribute.

### Inject response loss after both real transitions

Playwright creates and accepts a real plan, creates a real workout, then lets the link endpoint return 201 from PostgreSQL before aborting the browser response. Reconciliation finds one complete tuple and request count remains one. It then lets unlink return 200 before another abort; reconciliation finds the target absent, reports no closure cause and DELETE count remains one.

### Rebaseline measured Week Fold growth only

Budgets move to H5 total/async 2,474,500/199,500 bytes and WeApp total/page 871,000/45,500 bytes. H5 entry and WeApp vendor ceilings remain fixed at 320,000 and 25,000.

## 4. Validation evidence

- Focused recovery and plan-model validation passed 44 tests, including all nineteen operations and link-intent retention.
- Repository-wide unit validation passed 65 files / 328 tests.
- Strict workspace TypeScript and repository formatting passed.
- The complete plan browser suite passed 10/10, including normal and interrupted association lifecycles.
- One new real-service response-loss scenario committed and reconciled both link and unlink with one request each.
- The complete main H5 browser suite passed 52/52 tests in 2.5 minutes. The dedicated OIDC suite passed 3/3; the repository now retains 55 browser tests.
- H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,473,823 bytes, entry 318,996 and largest async JavaScript 198,901; WeApp total 870,189, vendor 18,915 and largest page 45,091 (`pages/plans`). Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-059-plan-link-reconciliation-mobile.png` and `iteration-059-plan-unlink-reconciliation-mobile.png`.

The PostgreSQL integration and AI/evaluation suites were not rerun because API, database, domain planning rules, prompt, validator and worker code did not change. Main browser proof exercised the unchanged association API and PostgreSQL transition model directly.

## 5. Problems found and experience captured

- Server create deduplication is stronger than a generic POST but narrower than a client-visible “same workout” idea: all plan/session/workout revision fields must match. Client reconciliation must keep the same exact tuple.
- A tuple-safe replay can still hide current authority. Reading first exposes whether another link occupies the session/workout without asking the server to resolve it as another write failure.
- Active-list absence is not a closure receipt. Workout deletion can close the same relationship, so copy must not claim the user explicitly unlinked it or that either source record was deleted.
- Applying a plan projection normally selects its first session. Recovery must explicitly return to the intended session date so retained relationship context remains visible.
- Link uncertainty affects more than one button. Day navigation, plan decisions and substitutions can change the visible context even without writing the relationship, so all competing plan controls share the same guarded pause.
- The plan route becomes the largest WeApp page at 45,091 bytes. The total/page gates moved only by measured growth; the unchanged vendor and H5 entry gates did not move.
- Full E2E refreshed historical screenshots. All tracked test-generated changes were restored; only the two new iteration-059 artifacts remain.

## 6. Global state review, remaining risks and next step

Every current Week Fold write now stops on response ambiguity and consults owner-visible authority before reporting a result. The active link projection is sufficient for exact create and current absence, but intentionally cannot recover a closure reason. Proof covers local browser/API response loss and PostgreSQL commits; it does not prove real radio timing, multi-device races, WeChat accessibility or hosted exact-SHA behavior.

Iteration 060 should audit AI plan-explanation generation. It must derive recovery authority from the durable run/idempotency contract, retain only explicit visible consent, reconcile plan revision and provenance before display, prevent an unknown/stale note from appearing current and prove duplicate-free response loss through the real local API/worker fixture. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 058 archive](058-weekly-plan-write-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [ADR-0053](../architecture/decisions/0053-weekly-plan-write-recovery.md)
- [ADR-0054](../architecture/decisions/0054-plan-workout-link-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
