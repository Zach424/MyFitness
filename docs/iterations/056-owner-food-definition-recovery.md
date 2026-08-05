# Iteration 056: Owner-food definition recovery parity

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round applies the accepted authority-aware workbench contract to the owner-food definition register. Acceptance requires an ambiguous create to retain the exact nutrient/reference form and retry only with its unchanged in-memory idempotency key; correction/archive to reconcile current server state before any repeat; unresolved writes to block pointer and keyboard replay; and real API response-loss proof to show exactly one created definition, an exact recovered correction and no premature archive success.

The round does not add a nutrition database, barcode/provider identity, recipe calculator, verified nutrient claim, offline/background queue, migration, API, provider, cloud service, credential, diagnosis, target or prescription.

## 2. Structure, technology and design state

- `lib/workbench-recovery.ts` expands from seven to ten classified operations with `food_create`, `food_update` and `food_archive`; it remains dependency-free and shared with the action/photo workbenches.
- The dedicated Taro food register owns one pending create key, preserved `FoodForm` input and one explicit recovery state. Any create-field mutation clears both the state and key.
- Create uses the existing owner/key/request-hash server guard. Correction/archive continue to use expected revisions and expose current-catalog reconciliation rather than blind replay.
- Exact correction comparison covers name, aliases, category, energy/macros/fiber, reference and default serving. Equality proves request/result agreement only, never nutritional accuracy.
- All write controls use the shared pointer/Enter/Space activation guard and explicit `aria-disabled`. Inline token colors keep Taro H5 cancel/destructive/recovery text visible.
- Three reviewed 390 × 844 artifacts capture create, correction and archive response-loss states without adding a new visual motif or route.

## 3. Implementation method

### Extend policy before page behavior

The service audit confirmed that food creation already has owner-scoped idempotency, while correction and archive expose only optimistic revision authority. The matrix therefore gives create `retry_same_request`, correction/archive `reconcile_required` and 4xx refusal a terminal state. Unit coverage enumerates all ten operations and their retained-input boundaries.

### Keep one create identity while the payload is unchanged

The register creates a request key only when save first runs and reuses it after a transport-ambiguous result. Every form/category mutation clears the key and recovery state, so a changed payload cannot inherit an old request identity. The key stays in a React ref only; no request or form is queued or persisted.

### Reconcile correction with exact current evidence

After a lost `PUT` response, the page reloads the active owner catalog. It reports the correction as committed only when the current revision advanced and every submitted field matches the retained form. A missing definition becomes terminal without discarding the inputs; an unchanged or divergent revision becomes the new comparison base and does not produce false success.

### Limit archive claims

After a lost `DELETE` response, the confirmation dialog disables another archive attempt and offers only `核对服务端状态`. Absence from the active catalog closes the editor with the narrow statement that the food will not be used for future selection. A still-present definition is restored as the current editing base. Neither outcome rewrites or judges meal drafts, meals, favorites or immutable revisions.

### Inject response loss after real commits

Playwright lets each create/update/delete reach the real API and PostgreSQL, asserts the committed status, then aborts only the browser-facing response. Create retry proves two attempts use one non-empty key and render one definition. Correction reconciliation proves the server's exact R2 matches the visible form. Archive shows no success before a follow-up list read proves active-catalog absence.

### Rebaseline only measured lazy growth

The food register becomes the largest WeApp page at 42,011 bytes while H5 entry and WeApp vendor remain fixed. Budgets move narrowly to H5 total/async 2,451,000/193,500 bytes and WeApp total/page 850,000/42,500 bytes. H5 entry and WeApp vendor ceilings remain 320,000/25,000.

## 4. Validation evidence

- Focused recovery-contract validation passed 21 tests, including all ten classified operations.
- Repository-wide unit validation passed 65 files / 310 tests.
- Strict workspace TypeScript and repository formatting passed.
- Two focused real-service browser scenarios passed: ambiguous owner-food create and the complete create/correct/archive snapshot lifecycle with injected update/archive response loss.
- The complete main H5 browser suite passed 47/47 tests in 2.4 minutes. Together with the unchanged dedicated OIDC suite, the repository now retains 50 browser tests.
- H5 and WeApp production builds passed. Known non-blocking Taro cache/entry-size warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,450,504 bytes, entry 318,996 and largest async JavaScript 193,150; WeApp total 849,399, vendor 18,915 and largest page 42,011 (`pages/food-catalog`). Forbidden runtime-marker scans are empty.
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-056-food-create-recovery-mobile.png`, `iteration-056-food-update-reconciliation-mobile.png` and `iteration-056-food-archive-reconciliation-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, database, identity, prompt, validator and worker code did not change. Browser tests exercised the unchanged API/PostgreSQL idempotency and revision paths directly.

## 5. Problems found and experience captured

- Sharing one route and visual editor does not make food and action authority identical in wording. Food recovery must name nutrient/reference input and explicitly avoid implying verification.
- Reconciliation needs complete field equality. Comparing only name/revision could incorrectly accept a server revision whose nutrition or reference differs from the retained request.
- Active-catalog absence after archive is useful but narrow evidence. It proves future-choice removal, not historical rewrite, correctness of nutrients or deletion of unrelated records.
- An in-memory key must be coupled to form mutation, not merely editor open/close. Otherwise a corrected payload could reuse an earlier request identity and trigger the server hash conflict.
- Taro again rendered some semantically named button labels visually blank until explicit token colors were added. Screenshot inspection caught cancel/destructive labels that selector-only browser checks would miss.
- Full-page screenshots of a scroll container did not reliably foreground the recovery strip. Scrolling the asserted authority panel into the viewport produced clearer evidence without changing behavior.
- Full E2E refreshed historical screenshots. All tracked test-generated changes were restored; only the three new iteration-056 artifacts remain.

## 6. Global state review, remaining risks and next step

All locally implemented definition registers now follow one accepted recovery matrix, and the owner-food flow no longer converts a lost response into duplicate creation, blind mutation replay or an overstated nutrition/archive claim. The tests simulate response loss after real local commits; they do not establish radio-transition behavior, WeChat-device accessibility or production nutrition/source quality.

Iteration 057 should audit and implement equivalent authority-aware failure/recovery for the privacy-sensitive progress-photo workflow. Reservation/upload/delete must follow actual service authority, preserve only explicit non-media capture intent, avoid photo/background replay, keep retention/deletion claims narrow and add real API interruption proof where the current read model can establish state. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 055 archive](055-authority-aware-workbench-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0037](../architecture/decisions/0037-user-owned-food-catalog.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
