# Iteration 053: Ambiguous health-record save recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round gives new health-record saves one deterministic recovery loop for the hardest client failure: the service commits the record but the response never reaches the page. Acceptance requires the page to avoid both fake success and a false definite failure, retain exact visible input, distinguish transport/service uncertainty from explicit server refusal, expose an enabled retry action, reuse the exact same idempotency key for an unchanged draft and produce exactly one final record through the real API.

The scope is deliberately limited to health-record create. It adds no background/offline queue, persistent request payload/key, API, migration, provider, cloud service, credential, dataset, photo retry, medical interpretation or plan prescription.

## 2. Structure, technology and design state

- `apps/client/src/lib/save-recovery.ts` is a dependency-free presentation classifier for ambiguous network outcomes, retryable service statuses, server refusals and unexpected failures.
- The health-record editor owns one `SaveRecovery` state beside its existing feedback and in-memory request-key ref. A successful save clears both; every user mutation invalidates both before a future attempt.
- The existing server-side unique user/idempotency key and request hash remain the duplicate authority. No API code or schema changed.
- The recovery card uses the established warning surface, an explicit bilingual state label and a mineral primary retry control. Polite atomic status semantics expose the complete state without relying on color.
- Taro's `disabled="false"` custom-element output is handled with an exact `disabled="true"` CSS selector so the enabled retry control stays at full opacity.
- Technology remains TypeScript strict mode, Taro 4/React, NestJS/PostgreSQL, Vitest and Playwright. No dependency was added.

## 3. Implementation method

### Preserve uncertainty instead of inventing a result

Transport markers such as Taro `request:fail`, fetch failure and timeout map to `network_uncertain`. Retryable 408/425/429/5xx responses map to `service_unavailable`; other HTTP responses map to `server_rejected` and retain the server message. An unclassified runtime error uses safe unknown-outcome copy rather than exposing adapter internals.

### Bind retry to the unchanged payload

Create generates the request key immediately before its first submission. A caught ambiguous/service error does not reset it. Retry therefore sends the same built request with the same key. Changing metric, score/value, unit or occurrence fields clears the recovery presentation and key, so a changed payload cannot reuse an earlier identity.

### Prove the committed-but-lost case

Playwright intercepts only `POST /v1/health-records`. Its first handler calls the real upstream API and asserts `201`, then aborts the response toward the browser. The page must show `CONNECTION UNCERTAIN`, keep `74.2`, provide a visible/enabled/full-opacity retry and avoid adding a log item. The second request continues normally; its key must equal the first non-empty key and the final log must contain exactly one `74.2 kg` item.

### Keep local drafts and background sync separate

The existing 24-hour owner-scoped draft may protect meaningful form input through reload, but this round stores no network operation or key there. Retry is user initiated in the current page instance. This separation avoids replaying sensitive or stale work after account/context changes.

### Rebaseline only measured totals

The previous client gate correctly rejected H5 total 2,423,196 against 2,421,000. Measurement showed entry, largest async route, vendor and largest WeApp page unchanged; only total trees grew. H5/WeApp total ceilings therefore move narrowly to 2,424,000/827,000.

## 4. Validation evidence

- Focused recovery and record-model validation passed 2 files / 14 tests; the recovery contract contributes 9 cases.
- Repository-wide unit validation passed 64 files / 289 tests.
- Strict workspace TypeScript and repository formatting passed.
- Focused ambiguous-response browser validation passed 1/1; the complete health-record browser suite passed 8/8.
- The complete main H5 browser suite passed 41/41 tests in 2.1 minutes.
- H5 and WeApp production builds passed. The known non-blocking Taro cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,423,196 bytes, entry 319,000 and largest async JavaScript 186,481; WeApp total 826,369, vendor 18,915 and largest page 39,748 (`pages/workouts`). Forbidden runtime marker scans are empty.
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `output/playwright/iteration-053-ambiguous-save-recovery-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, database, identity, prompt, validator and worker code did not change. The browser proof exercised the real unchanged health-record API and PostgreSQL idempotency path.

## 5. Problems found and experience captured

- “Request threw” does not mean “server did not commit.” UI copy must preserve this distinction or it can create duplicate health facts.
- A local draft and an idempotent retry solve different failures. Draft storage preserves input across interruption; the unchanged in-memory key reconciles an uncertain server result. Persisting both as a background queue would introduce account, expiry and consent hazards.
- The first strict visual assertion failed: Taro rendered `disabled="false"`, while `.save-button[disabled]` reduced opacity to `0.58`. Exact-value matching fixed the false-disabled appearance, and the final browser test now checks enabled semantics plus opacity `1`.
- The quality gate also failed first, correctly: H5 total exceeded its old ceiling. Only measured total dimensions were rebaselined; entry, async, vendor and largest-page budgets were not widened.
- Full E2E rewrote historical screenshot files. Those test-generated changes were restored, retaining only the new response-loss evidence.
- A server refusal must not borrow offline language. The classifier tests 400/409/422 separately from Taro/fetch failure and retryable 503.

## 6. Global state review, remaining risks and next step

Health-record create now has duplicate-safe, user-visible reconciliation for a committed response that disappears. This is local H5/API evidence, not proof of radio transitions or WeChat network behavior on a physical device. Workout and meal creates already have server idempotency and in-memory keys but still present raw failure copy; delete, correction and photo operations require different authority-aware policies.

Iteration 054 should apply the unchanged-payload recovery contract to workout and meal creates. It must preserve their full drafts, reset the key on every meaningful edit, expose enabled retry controls and use the real APIs to prove that committed-but-lost responses yield one workout and one meal. Photo media and unconfirmed candidates remain excluded from background replay. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 052 archive](052-accessibility-state-matrix.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [ADR-0004](../architecture/decisions/0004-health-record-revision-lifecycle.md)
- [ADR-0040](../architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [ADR-0051](../architecture/decisions/0051-ambiguous-create-response-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
