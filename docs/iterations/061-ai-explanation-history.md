# Iteration 061: Immutable AI explanation run ledger

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round exposes the already-retained completed AI plan-explanation history as a bounded, owner-only and read-only provenance ledger. Acceptance requires current/frozen/history plan authority, visible source/prompt/validator/fallback provenance without provider secrets, progressive disclosure without regeneration, review-only safety language, private/no-store history responses, keyboard/mobile/wide accessibility and real API/fixture-worker proof across two plan revisions.

The round adds no AI-authored plan, health-fact mutation, medical advice, model/provider change, prompt or validator change, database migration, unbounded pagination, background polling, dataset, real provider, cloud service or credential.

## 2. Structure, technology and design state

- `pages/ai-explanations` is a dedicated Taro/React lazy route reached from the Week Fold AI card only after retained runs exist.
- A dependency-free presentation model classifies explanation authority and advances the visible history count in batches of five; focused Vitest coverage locks both behaviors.
- The page reloads the owner-visible weekly plan and the existing maximum-twenty explanation history together. Missing or foreign plans fail closed.
- Each run exposes model/fixture/fallback source, plan revision, completion time, prompt version, validator version, fallback reason and validated safety note. Internal provider/model identifiers and request keys are omitted.
- The history controller now explicitly emits `private, no-store, max-age=0`; PostgreSQL integration coverage retains owner isolation and verifies the cache boundary.
- Two reviewed artifacts cover the two-revision 390 × 844 ledger and the capped-width 1440 × 1100 composition.

## 3. Implementation method

### Separate current planning from historical audit

Week Fold keeps only one secondary navigation action and does not import the full ledger layout. The lazy route contains the provenance grid, revision boundaries and expandable prose, preventing historical explanation content from becoming the visual authority over the current plan.

### Recompute authority from the current owner plan

An immutable explanation cannot determine its own current validity. The page reloads the current plan and combines exact revision equality with `canExplainWithAi`: matching and eligible is `current`, matching but no longer eligible is `frozen`, and every older revision is `history`. Historical/frozen cards state that they cannot interpret the current version.

### Keep disclosure bounded and provider-free

The API already returns at most twenty completed runs. The client renders five first and reveals five more per explicit action without another provider or mutation call. Provenance fields useful to the user remain visible, but the worker's internal model identifier, raw receipt and request key are intentionally not rendered.

### Preserve cross-end accessibility

All actions reuse the explicit pointer/Enter/Space adapter required by Taro custom controls. The route gives delayed H5 focus to its back action, uses list/expanded semantics and keeps a readable capped width on large screens. Browser proof opens a historical revision with Enter.

### Rebaseline only measured lazy-route growth

H5 total grows from 2,478,181 to 2,606,897 bytes while entry/largest async JavaScript remain within their existing ceilings at 319,232/199,198. WeApp total grows from 875,764 to 891,134, vendor remains 18,915 and Week Fold reaches 49,800. Budgets move only to 2,607,000 H5 total, 892,000 WeApp total and 50,000 WeApp page; existing entry/async/vendor ceilings remain fixed.

## 4. Validation evidence

- Focused presentation-model validation passed 2/2 tests; the AI PostgreSQL integration suite passed 5/5 including owner-only history and no-store response evidence.
- Repository-wide unit validation passed 66 files / 333 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict workspace TypeScript passed; API, normal H5, OIDC H5 and WeApp production builds passed.
- The complete main H5 browser suite passed 54/54 in 2.9 minutes, including the new two-revision ledger scenario. The dedicated OIDC suite passed 3/3; the repository now retains 57 browser tests.
- `pnpm client:verify` passed: H5 total 2,606,897 bytes, entry 319,232 and largest async JavaScript 199,198; WeApp total 891,134, vendor 18,915 and largest page 49,800 (`pages/plans`). Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-061-ai-ledger-mobile.png` and `iteration-061-ai-ledger-wide.png`.

## 5. Problems found and experience captured

- A run's plan revision is necessary but insufficient authority. Eligibility/evidence can freeze an explanation without changing its stored revision, so live plan freshness must participate in display classification.
- A dedicated lazy route has a measurable total-build cost even when the initial entry bundle remains stable. Total, entry and largest-route measurements must be reported separately rather than describing all growth as initial-load growth.
- Historical prose needs both a revision badge and a plain-language authority boundary; color or `HISTORY` alone is not enough for assistive or non-technical reading.
- Progressive disclosure over a bounded response is not server pagination. The archive and UI deliberately promise only the latest twenty retained completed runs.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-061 artifacts remain.

## 6. Global state review, remaining risks and next step

AI explanation generation, exact response-loss recovery and retained-run review are now locally complete as separate authority layers. The ledger still relies on local fixture proof, supports only the latest twenty runs and does not establish real-provider quality, cost, retention, multi-device behavior, WeChat accessibility or hosted exact-SHA evidence.

Iteration 062 should audit and harden one bounded read-side failure path, beginning with Today. It should preserve already-visible confirmed evidence during refresh failure, distinguish initial load/empty/offline/server refusal, expose one foreground retry without polling and prove recovery at mobile/wide viewports. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 060 archive](060-ai-explanation-request-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0009](../architecture/decisions/0009-review-only-ai-explanations.md)
- [ADR-0023](../architecture/decisions/0023-crash-safe-ai-explanation-lifecycle.md)
- [ADR-0055](../architecture/decisions/0055-ai-explanation-request-recovery.md)
- [ADR-0056](../architecture/decisions/0056-read-only-ai-explanation-ledger.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
