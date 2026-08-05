# Iteration 064: Privacy custody read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the privacy custody desk's first and post-mutation reads. Acceptance requires unknown versus successful-empty distinction, pending account-erasure receipt recovery before every first overview attempt, a retained but labeled inventory after refresh failure, frozen export/revocation/erasure controls while authority is uncertain, product-owned failure families, one explicit keyboard-operable retry and real API proof at mobile and wide viewports.

The round adds no API/schema/database change, polling, persistent privacy-overview cache, offline database, background synchronization, mutation replay, cloud service, real provider or credential.

## 2. Structure, technology and design state

- `privacy.model.ts` owns five read phases and four failure families without React, Taro or network dependencies; six focused Vitest cases lock classification and empty/unknown/stale boundaries.
- The page's first authority chain always runs local erasure-receipt recovery before requesting the service overview. Retrying before any accepted snapshot repeats that complete chain.
- Initial failure renders a dedicated authority card instead of a zero inventory or actionable custody desk. A failed later check retains the exact prior total and generated time beneath an amber read-only rail.
- Export, optional-consent revocation, export skipping, deletion acknowledgement, confirmation phrase and permanent deletion all require `ready` authority. Back, profile editing and logout stay active.
- Two reviewed artifacts cover a 390 × 844 initial offline state and a 1440 × 1000 refused post-revocation refresh retaining nine old inventory items.

## 3. Implementation method

### Preserve the erasure-receipt recovery order

One guarded authority loader first reads the recoverable receipt. Only an explicit no-receipt result proceeds to the privacy overview. It accepts an activity callback so an unmounted Taro page cannot publish a late result, and retry before the first accepted overview reuses the same ordered chain rather than jumping directly to inventory.

### Separate retained evidence from permission to act

The accepted overview marker is independent from the initial null value. During refresh or after a failed refresh, the last overview stays visible only as a retained page-memory projection. `readAuthorityReady` joins both disabled semantics and handler guards for every custody action, so a Taro custom control cannot bypass the freeze through pointer or keyboard activation.

### Own recovery language and focus

Transport, 4xx, 5xx and unexpected failures map to bounded product language. Initial errors explain that neither receipt nor inventory is yet known; stale errors state that the old inventory is read-only. The one explicit retry receives delayed H5 focus after failure, while concurrent reads are rejected and no timer starts polling.

### Rebaseline only measured total growth

H5 total moves from 2,618,689 to 2,624,965 bytes while entry and largest async JavaScript remain 319,235/199,198. WeApp total moves from 905,385 to 912,623, vendor remains 18,915 and Week Fold remains the largest page at 55,523. Budgets move only to 2,626,000 H5 total and 913,000 WeApp total.

## 4. Validation evidence

- Focused privacy read-state validation passed 6/6 tests.
- Repository-wide unit validation passed 68 files / 342 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting and diff whitespace checks passed.
- The complete main H5 browser suite passed 60/60 in 2.5 minutes, including both new fault/retry scenarios. The dedicated OIDC suite passed 3/3; the repository now retains 63 browser tests.
- Normal H5, OIDC H5, WeApp, administrator and API production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,624,965 bytes, entry 319,235 and largest async JavaScript 199,198; WeApp total 912,623, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-064-privacy-initial-offline-mobile.png` and `iteration-064-privacy-stale-wide.png`.

## 5. Problems found and experience captured

- Privacy authority is a chain, not one overview request. A retry that bypasses pending erasure-receipt recovery can hide the only durable evidence of a completed deletion.
- A successful mutation followed by a failed refresh creates a particularly dangerous stale view: the old active-consent label is visible even though the revoke may have committed. Retaining it is acceptable only with a strong stale label and a complete action freeze.
- Hiding the initial inventory is safer and clearer than rendering a plausible zero. Successful empty results need an accepted-snapshot marker rather than sharing the initial null state.
- Disabling visible controls is insufficient for Taro custom elements. Every sensitive handler must independently require current authority.
- Operation failures and authority-read failures require different recovery controls. Dismissing a failed export/revoke message must not masquerade as rereading the custody ledger.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the two iteration-064 artifacts remain.

## 6. Global state review, remaining risks and next step

The privacy desk now protects inventory, consent and erasure decisions with local response authority while retaining no new sensitive state outside current page memory. It still has no durable offline cache, server snapshot token, real-radio/WeChat proof, cross-device behavior or hosted exact-SHA evidence. Those are not inferred from browser interception.

Iteration 065 should audit the health-record ledger's list authority before create, correction, history or deletion. It should prevent an initial list failure from appearing as an empty logbook, retain a labeled last successful page only in memory, freeze mutations until authority returns and prove explicit recovery without cloud or real-provider input. Managed deployment and real identity/provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 063 archive](063-week-fold-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-privacy-ownership-and-account-erasure.md)
- [ADR-0015](../architecture/decisions/0015-recoverable-account-erasure-receipts.md)
- [ADR-0022](../architecture/decisions/0022-progress-photo-privacy-lifecycle.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
