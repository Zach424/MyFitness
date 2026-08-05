# Iteration 058: Weekly-plan authority-aware recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round applies the authority-aware workbench contract to weekly-plan generation/regeneration, adoption, substitution saving and skipping. Acceptance requires each interrupted write to stop competing plan actions, retain only page-owned decision evidence, read the current owner projection before any repeat, distinguish no-success and divergent revisions, recover only an exact result, and prove through the real API that a committed response loss does not create a duplicate or false decision.

The round adds no adaptive plan rule, medical judgment, workload prescription, adherence inference, dataset, external model, API, migration, provider, cloud service, credential, offline queue or background synchronization.

## 2. Structure, technology and design state

- `lib/workbench-recovery.ts` expands from thirteen to seventeen classified operations with `plan_generate`, `plan_accept`, `plan_modify` and `plan_skip`. All four require reconciliation; only modification retains `decision_input`.
- Week Fold stores the requested Monday, visible base plan ID/revision, decision and substitution selections in page memory only. It stores no plan request or replay command.
- The authenticated weekly-plan list is the read-side authority because it projects current content, revision, status, freshness and active session links.
- Generation accepts the exact requested week projection without another `POST`. Decisions accept only the exact plan ID, `base revision + 1`, requested status and submitted modified selections.
- Same-revision and divergent-revision outcomes are visibly distinct. Neither automatically repeats or overwrites a decision.
- The amber `WRITE ? → READ` strip keeps the Week Fold visible, names page-owned substitution retention and leaves one foreground reconciliation action. Shared activation guards block pointer, Enter and Space on competing actions and emit explicit `aria-disabled`.
- Three reviewed 390 × 844 artifacts cover unknown generation, modification and skip responses before reconciliation.

## 3. Implementation method

### Derive generation authority from live evidence

The service computes its generation request hash from the visible week input, onboarding revision and complete deterministic payload derived from current dashboard evidence. Reusing the same key after evidence changes is not the same request and correctly conflicts. The client therefore retains the week/base projection and, after ambiguity, reads the exact week instead of replaying the `POST`. The same revision can be a legitimate same-evidence no-op; a newer projection is loaded as current authority without claiming which request caused it.

### Match decisions to one exact transition

Every accepted decision increments the aggregate once and writes an immutable revision. Recovery therefore requires the same plan ID, exactly `base + 1` and the requested accepted/modified/skipped status. Modified recovery also checks every retained activity/option selection against the resulting plan. A matching status on a later revision is insufficient and becomes a divergent authority state.

### Preserve reviewable input without creating a queue

Substitution selections stay rendered in the draft while the ambiguous write is unresolved. They are neither serialized nor treated as consent to retry. Accept and skip retain no additional input. A terminal action clears the in-memory attempt; a concurrent projection is loaded only after the user explicitly chooses it.

### Separate no evidence from concurrent authority

If the plan is still at the base revision, the page says there is no success evidence and requires a new explicit decision. If another revision/status exists, it offers only to load that owner-visible version and never overwrites it. If the requested week or plan is absent, the attempt ends without replay. These states avoid both “saved” optimism and automatic retry.

### Inject response loss after real plan commits

Playwright lets generation, modification and skip reach the real NestJS API and PostgreSQL, asserts the server returned 201/200, then aborts only the browser-facing response. Request counters stay at one for generation and one for each decision. Read-side reconciliation recovers v1, v2 with the selected high-goblet squat substitution, and v3 skipped.

### Rebaseline only measured Week Fold growth

Budgets move narrowly to H5 total/async 2,470,000/199,000 bytes and WeApp total 866,000 bytes. H5 entry, WeApp vendor and WeApp page ceilings remain fixed at 320,000, 25,000 and 43,500 bytes.

## 4. Validation evidence

- Focused recovery and plan-model validation passed 40 tests.
- Repository-wide unit validation passed 65 files / 324 tests.
- Strict workspace TypeScript and repository formatting passed.
- The complete plan browser suite passed 9/9, including safety hold, evidence freshness, AI explanation, immutable history and explicit workout linking.
- Two new real-service response-loss scenarios passed: one generation reconciliation and one modification-plus-skip reconciliation.
- The complete main H5 browser suite passed 51/51 tests in 2.7 minutes. The dedicated OIDC suite passed 3/3 after its required OIDC-specific build; the repository now retains 54 browser tests.
- H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,469,269 bytes, entry 318,996 and largest async JavaScript 198,650; WeApp total 865,205, vendor 18,915 and largest page 42,976 (`pages/progress-photos`). Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-058-plan-generate-reconciliation-mobile.png`, `iteration-058-plan-modify-reconciliation-mobile.png` and `iteration-058-plan-skip-reconciliation-mobile.png`.

The PostgreSQL integration and AI/evaluation suites were not rerun because API, database, domain planning rules, prompt, validator and worker code did not change. The browser suite exercised the unchanged plan API and PostgreSQL transition model directly.

## 5. Problems found and experience captured

- A visible generation payload is not the full idempotency payload. Live onboarding and dashboard evidence participate in the server hash, so “reuse the same key” is unsafe once that evidence may have changed.
- A same generation revision does not prove failure. The server intentionally returns the existing plan when the planning-impact evidence fingerprint is unchanged; reconciliation must accept the authority state without inventing a new revision.
- Decision recovery has stronger evidence than generation: the exact next revision and requested status are necessary. Modified decisions additionally need selection equality so a generic `modified` state is not over-credited.
- Page-owned substitution choices are useful comparison evidence but not permission to persist or background-replay a request.
- Updating the plan projection and reloading its immutable history are separate outcomes. A confirmed write remains confirmed even when the optional history refresh fails; the page reports that narrower refresh issue instead of reopening write uncertainty.
- Taro custom buttons again required CSS to target explicit `aria-disabled='true'`; a bare `[disabled]` selector can make `disabled="false"` look unavailable.
- The first combined OIDC command ran against the ordinary development-auth H5 build and failed at the expected login boundary. Rebuilding with the repository's OIDC-specific command produced 3/3 passing tests; the normal H5 artifact was then rebuilt before measurement.
- Full E2E refreshed historical screenshots. All tracked test-generated changes were restored; only the three new iteration-058 artifacts remain.

## 6. Global state review, remaining risks and next step

All direct weekly-plan decisions now stop on response ambiguity and consult the owner-visible projection before claiming a result. The proof covers local HTTP/browser response loss and PostgreSQL commits; it does not prove real radio transitions, multi-device races, WeChat accessibility or hosted exact-SHA behavior. The API still has no durable per-decision operation receipt, so absent/divergent outcomes intentionally require user review.

Iteration 059 should apply the same audit to explicit plan-to-workout link creation and removal. It must derive authority from exact plan/workout/link revisions, preserve only visible user link intent, reconcile one exact active session link before any repeat, avoid inferred adherence or automatic migration and prove duplicate-free link/unlink outcomes through the real API. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 057 archive](057-progress-photo-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0053](../architecture/decisions/0053-weekly-plan-write-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
