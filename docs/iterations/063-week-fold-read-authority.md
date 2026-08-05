# Iteration 063: Week Fold read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens Week Fold's initial and foreground-refresh reads. Acceptance requires unknown versus successful-empty distinction, one atomic plan/workout/decision-history/AI-history snapshot, retained revision/history after refresh failure, frozen plan mutations and provider calls while authority is uncertain, product-owned failure families, one explicit keyboard-operable retry and real API proof at mobile and wide viewports.

The round adds no API/schema/database change, polling, persistent health-plan cache, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `plan-read.model.ts` owns five read phases and four failure families without React, Taro or network dependencies; three focused Vitest cases lock the empty/unknown/stale boundaries.
- Week Fold reads weekly plans and workout candidates together, then reads the selected plan's decision and AI histories before assigning any part of the new projection.
- Initial failure renders a dedicated authority card instead of `NO WEEK YET`. A failed later check retains the exact plan revision and loaded history-row count beneath an amber read-only rail.
- Plan generation, substitutions, accept/modify/skip, workout association and AI consent/provider controls all require `ready` authority. The previously implemented exact write-reconciliation reads remain available for their bounded pending intents.
- Two reviewed artifacts cover a 390 × 844 initial offline state and a 1440 × 1000 refused refresh retaining plan v1 and one decision row.

## 3. Implementation method

### Commit one composed read projection

Initial and changed-plan refreshes stage the plan list, workouts, plan history and AI history in local variables. React state changes only after all required reads complete, preventing a new plan with old histories or a new workout list beside an unverified plan. An accepted empty list is tracked independently, so later foreground checks still run without manufacturing an unknown state.

### Freeze every authority-sensitive action

`readAuthorityReady` joins the existing freshness and response-loss recovery gates. UI disabled semantics and handler-level guards cover all plan writes, workout links and AI calls. A stale fold therefore remains readable, including its history and provenance, but cannot be treated as the current decision surface.

### Own failure and focus behavior

Transport, 4xx, 5xx and unexpected failures map to bounded product language. Initial failure and a manually requested failed version check focus the single retry after Taro navigation settles; silent return-to-page refreshes preserve the user's current focus. Retry performs one foreground snapshot read and schedules no polling.

### Rebaseline only measured route growth

H5 total moves from 2,612,535 to 2,618,689 bytes while entry changes from 319,236 to 319,235 and largest async JavaScript remains 199,198. WeApp total moves from 898,132 to 905,385, vendor remains 18,915 and Week Fold grows from 49,800 to 55,523. Budgets move only to 2,620,000 H5 total, 906,000 WeApp total and 56,000 largest page.

## 4. Validation evidence

- Focused read-state validation passed 3/3 tests.
- Repository-wide unit validation passed 68 files / 339 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and diff whitespace checks passed.
- The complete main H5 browser suite passed 58/58 in 2.7 minutes, including both new fault/retry scenarios. The dedicated OIDC suite passed 3/3; the repository now retains 61 browser tests.
- Normal H5, OIDC H5, WeApp, administrator and API production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,618,689 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 905,385, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-063-plan-initial-offline-mobile.png` and `iteration-063-plan-stale-wide.png`.

## 5. Problems found and experience captured

- A failed list request is not evidence that no plan exists. Successful emptiness must have its own accepted-snapshot marker rather than share the initial empty array.
- Plan history and AI history are part of the authority surface, not decorative follow-up requests. Assigning the plan before either history succeeds creates a misleading mixed revision.
- Disabling the visible button is insufficient for Taro custom elements. Authority gates must also block pointer and keyboard callbacks and must cover provider authorization as well as mutations.
- Automatic return-to-page checks should freeze actions while in flight but must not move focus after a silent failure. Explicit user-triggered checks can move focus to the recovery action.
- The first mobile evidence capture occurred during Taro's horizontal route animation and looked clipped even though the final layout had no overflow. Browser evidence now polls the plan page's actual left boundary before capture instead of adding an unrelated layout workaround.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-063 artifacts remain.

## 6. Global state review, remaining risks and next step

Week Fold now shares Today's local response-authority boundary while keeping all sensitive plan data in page memory. It still has no durable offline cache, snapshot timestamp, real-radio/WeChat proof, cross-device behavior or hosted exact-SHA evidence. Those are not inferred from browser interception.

Iteration 064 should audit the privacy ledger's read authority before any export, consent revocation or account-erasure action. It should prevent an inventory failure from appearing as zero owned data, retain a labeled last successful inventory only in memory, freeze destructive/export controls until authority returns and prove explicit recovery without cloud or real-provider input. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 062 archive](062-today-read-resilience.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0053](../architecture/decisions/0053-weekly-plan-write-recovery.md)
- [ADR-0054](../architecture/decisions/0054-plan-workout-link-recovery.md)
- [ADR-0055](../architecture/decisions/0055-ai-explanation-request-recovery.md)
- [ADR-0056](../architecture/decisions/0056-read-only-ai-explanation-ledger.md)
- [ADR-0058](../architecture/decisions/0058-week-fold-read-snapshot-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
