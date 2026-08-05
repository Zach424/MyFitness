# Iteration 081: Profile/goal response-loss recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes adult profile/goal replacement resilient to a lost PUT response. Acceptance requires the interrupted save to stop before another write, retention of the exact validated submission and nullable base revision only in page memory, one explicit current-profile read, complete response-visible content equality before success, preserved local input on unchanged/divergent evidence and no silent risk/consent inference or rebase.

The round adds no API/schema/database change, persistent profile draft, automatic/background replay, polling or offline queue. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `onboarding-recovery.ts` owns a dependency-free failure taxonomy, complete submitted-response projection and revision evidence classifier.
- The onboarding page freezes base revision plus one exact `OnboardingRequest` in React memory. Text, choice and consent controls lock during request/reconciliation so visible input remains exact.
- The normal save action becomes one amber polite/atomic receipt with submitted-base evidence and a guarded, focused `核对保存结果` action.
- The existing current-profile GET and no-silent-rebase resolution remain authoritative; no new read model or server contract is introduced.
- Mobile evidence keeps all risk choices, four consent states and the response-loss receipt in one readable column.

## 3. Implementation method

### Separate an exception from the transaction result

Network markers, 408/425/429/5xx responses and unknown adapter errors require reconciliation. Explicit non-retryable refusal terminates the attempt. Known 409 continues to use the existing conflict GET. None of these paths sends a PUT automatically.

### Freeze one complete submitted projection

The validated request is built once before PUT and retained with its nullable base revision. Reconciliation compares display profile fields, display height/unit, timezone, complete goal, ordered availability/equipment/diet arrays, risk flags and active terms/privacy/health-data versions. Server IDs, canonical height, derived eligibility and timestamps are excluded because they were not submitted.

### Resolve first, unchanged and divergent evidence

A first or advanced current revision plus complete projection equality proves the desired transaction state and updates accepted authority. Same revision, or continued confirmed absence for a first profile, proves no new state is visible and permits only a later explicit save. Older, unexpectedly missing or changed current evidence preserves the frozen local input and enters the existing explicit discard/load-current choice.

### Prevent form/request races

Profile controls now lock from request start through reconciliation. Step navigation remains available for reviewing the exact input, but no field can change beneath an in-flight request. A failed GET retains the receipt and frozen input; terminal refusal closes back to a fresh explicit decision.

## 4. Validation evidence

- Repository-wide unit validation passed 76 files / 392 tests, including six onboarding failure/projection/evidence cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- One targeted real-service browser scenario passed. PUT committed v1→v2 before only the browser response was aborted, and exact GET accepted complete current evidence with one PUT. A second PUT aborted before commit, exact GET proved v2, and v3 occurred only after a third, explicit user save. The frozen display name, risk choices and consent states remained present.
- The complete main browser suite passed 87/87 in 2.8 minutes, including existing profile initial-offline, stale-refresh and 409 conflict cases; the correctly sequenced OIDC build/suite passed 3/3, retaining 90 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,815,911 bytes, entry 319,237 and largest async JavaScript 207,699; WeApp total 1,043,387, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,818,000/1,045,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-081-profile-save-reconciliation-mobile.png`.

## 5. Problems found and experience captured

- Optimistic concurrency prevents overwrite but does not make a blind retry good recovery. Reading evidence first avoids using 409 as a user-facing network-status detector.
- Profile revision movement alone cannot prove goal, risk or consent content. All response-visible submitted facts must match before success copy appears.
- Server-derived canonical height and eligibility are important output evidence but are not equality inputs; comparing them as submitted fields would blur responsibility.
- Locking only the save button is insufficient. Without form locking, the response could settle an older payload while newer visible edits are incorrectly marked clean.
- Confirmed absence is the update equivalent of an unchanged revision for first-profile recovery: it permits a new explicit save, not inferred success.
- Visual review found Taro's disabled styling made unselected risk choices nearly disappear. Explicit muted/juniper text fill restores legibility while opacity and disabled semantics still communicate inactivity.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration artifact remains.

## 6. Global state review, remaining risks and next step

The complete profile/goal write now joins aggregate correction, deletion, favorite, definition, plan and media workbenches in treating response loss as unresolved evidence rather than ordinary failure. The proof establishes application-level local H5 behavior, not physical radio loss or WeChat-device behavior. Recovery is deliberately page-memory-only and cannot resume after reload.

The next local sensitive-mutation gap is optional-consent revocation. A committed revocation whose response disappears can leave the old overview looking active, while a blind repeat obscures cleanup evidence. Iteration 082 should reconcile the exact purpose through one current overview, accept only inactive consent, avoid inventing removed-item counts and require a fresh explicit revocation when it remains active. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-081 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 080 archive](080-meal-favorite-response-loss-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0003](../architecture/decisions/0003-identity-onboarding-boundary.md)
- [ADR-0066](../architecture/decisions/0066-profile-goal-register-read-authority.md)
- [ADR-0076](../architecture/decisions/0076-profile-goal-response-loss-recovery.md)
- [Identity/profile model](../architecture/IDENTITY_PROFILE_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
