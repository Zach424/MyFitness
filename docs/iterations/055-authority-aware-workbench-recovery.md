# Iteration 055: Authority-aware sensitive workbench recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round classifies every write in the lazy action-definition register and private food-photo workbench as same-request retry, reconciliation-required or terminal. Acceptance requires action create/photo reservation to reuse one in-memory idempotency key only for the same request; action correction/archive and photo upload/confirmation/deletion to avoid automatic replay; server refusal to terminate the attempt; non-media page input to remain visible; and no uncertain confirmation/deletion to become a meal fact or false custody claim.

The round adds no offline/background queue, persisted request, media path, new API, migration, provider, cloud service, credential, dataset, diagnosis, nutrition target or training prescription.

## 2. Structure, technology and design state

- `lib/workbench-recovery.ts` is a dependency-free seven-operation policy/classification contract with `retry_same_request`, `reconcile_required` and `terminal` authority.
- The action register retains its definition draft and unchanged create key. Correction reads the active catalog and compares the current revision/fields; archive reads the catalog before claiming that the action left future choices.
- The photo workbench retains only review selection while visible. Reservation may reuse its key, but selected files/paths are not stored. Upload, confirmation and deletion expose only a read-side reconciliation action.
- Missing confirmation never emits `foodPhotoConfirmed`; missing deletion means only that no reviewable proof remains and does not claim physical object deletion.
- Shared Taro activation now emits `aria-disabled` and blocks both pointer and Enter/Space callbacks while unavailable. Recovery panels use the existing amber warning/paper grammar with explicit visible token color.
- Four reviewed 390 × 844 artifacts capture action create/archive and photo reserve/confirm states. No new visual motif or route was added.

## 3. Implementation method

### Derive recovery from server authority

The service audit found owner/key/request-hash protection only on action create and photo reservation. Action update/archive use expected revisions; photo upload consumes media, confirmation clears candidate content and deletion starts durable cleanup. The client matrix therefore treats non-retryable HTTP refusal as terminal, allows an explicit same-key retry only for the two idempotent stages and requires read-side reconciliation for every other ambiguous outcome.

### Reconcile without expanding claims

The action register reloads current owner definitions. A lost correction is accepted only when its revision advanced and every submitted field matches; otherwise the preserved draft is compared against the current revision. A missing archived action proves only that it is no longer active. The photo workbench reads recent reviewable candidates by exact ID. A matching result remains a proposal; an absent committed confirmation yields no draft handoff, while absent deletion closes the proof view without claiming object deletion completion.

### Preserve the privacy boundary

The reservation retry opens the platform chooser again and reuses only the request key. The former automatic catch-path delete was removed because an upload response may be lost after producing a ready candidate; deletion before reconciliation would erase useful evidence. No file name/path, photo, preview, consent or replay command enters the meal-draft vault. Unresolved reservations/processes remain bounded by the existing 24-hour expiry and durable deletion lifecycle.

### Block replay at the event boundary

Playwright exposed that Taro's bare custom-element `disabled` attribute did not make the control disabled in the browser accessibility tree. The shared adapter now adds explicit `aria-disabled`, and handlers reject both pointer and keyboard activation. Recovery-state primary/destructive controls are visibly dimmed using the ARIA state rather than fragile attribute-value assumptions.

### Rebaseline only measured growth

The workbench contract/copy/styles increased lazy artifacts while leaving the H5 entry, WeApp vendor and largest WeApp page unchanged. H5 total/largest-async ceilings move to 2,445,000/193,000 bytes and WeApp total to 844,000. The entry/vendor/page ceilings remain 320,000/25,000/40,500.

## 4. Validation evidence

- Focused workbench/model/accessibility validation passed, including the complete seven-operation authority matrix.
- Repository-wide unit validation passed 65 files / 304 tests.
- Strict workspace TypeScript and repository formatting passed.
- Five focused real-service response-loss scenarios passed: action create, action archive, photo reservation, photo confirmation and photo deletion.
- The complete main H5 browser suite passed 46/46 tests in 2.3 minutes. Together with the unchanged dedicated OIDC suite, the repository retains 49 browser tests.
- H5 and WeApp production builds passed. Known non-blocking Taro cache/size warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,444,665 bytes, entry 318,996 and largest async JavaScript 192,747; WeApp total 843,194, vendor 18,915 and largest page 40,229 (`pages/workouts`). Forbidden runtime-marker scans are empty.
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-055-action-create-recovery-mobile.png`, `iteration-055-action-archive-reconciliation-mobile.png`, `iteration-055-photo-reserve-recovery-mobile.png` and `iteration-055-photo-confirm-reconciliation-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, database, identity, prompt, validator and worker code did not change. Browser tests exercised the unchanged API/PostgreSQL idempotency/revision paths and local private object storage.

## 5. Problems found and experience captured

- “Can retry” is an operation property, not an error-message property. The same network failure permits action create retry but forbids blind archive, upload, confirmation or deletion replay.
- Read-side absence must be phrased narrowly. Active-catalog absence proves future selection removal; review-list absence proves no reviewable candidate. Neither automatically proves every downstream destructive effect.
- A committed photo confirmation cannot be safely reconstructed because the API clears candidate content. The correct client outcome is no handoff, not a guessed meal draft.
- Automatically deleting a reservation after any upload exception was unsafe: the upload may have completed and only its response may be missing. Reconcile first; existing expiry/deletion remains the custody fallback.
- Taro H5 custom elements need event-level disable guards and explicit ARIA state. A visually present `disabled` attribute alone did not prevent Playwright from treating the button as enabled.
- Taro again rendered recovery-button text accessibly but visually blank until the token color was supplied explicitly. Screenshot review caught what semantic selectors alone could not.
- Full E2E refreshed historical screenshots. All tracked test-generated changes were restored; only the four new iteration-055 artifacts remain.

## 6. Global state review, remaining risks and next step

The two sensitive lazy workbenches now have a locally reproduced authority matrix and no background media synchronization. The tests simulate browser response loss after a real local commit; they do not prove physical radio transitions, WeChat device behavior or production object-store custody. Photo upload is classified/reconciled but not claimed as a real interruption test.

Iteration 056 should apply the same accepted contract to the user-owned food-definition register sharing the owner route: unchanged-key create, evidence-first correction/archive, retained nutrient/reference input, explicit Taro event guards and real API proof of one definition/no false archive success. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 054 archive](054-workout-meal-save-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Food-photo model](../architecture/FOOD_PHOTO_MODEL.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [ADR-0049](../architecture/decisions/0049-lazy-food-photo-proof-workbench.md)
- [ADR-0051](../architecture/decisions/0051-ambiguous-create-response-recovery.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
