# Iteration 060: Exact AI explanation request recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round applies authority-aware recovery to review-only AI plan-explanation generation. Acceptance requires one exact owner/key read boundary, durable pending/completed distinction, no second provider call, exact plan-revision validation before display, visibly retained per-request intent, stale-result isolation, private/no-store response handling and real API/fixture-worker response-loss proof.

The round adds no plan mutation, AI-authored training or diet plan, medical advice, persistent client queue, page-reload recovery, new database migration, prompt/validator/model change, dataset, real provider, cloud service or credential.

## 2. Structure, technology and design state

- `packages/contracts/src/ai.ts` adds a strict `pending | completed` explanation-request status union. Pending exposes only request/plan revision/deadline metadata; completed reuses the validated explanation provenance contract.
- NestJS adds authenticated `GET /plans/weekly/:planId/explanation-request` using the original idempotency header. PostgreSQL lookup is scoped by user, plan and key, reconciles an already-expired exact row to its prevalidated fallback and returns no cacheable response.
- The workbench matrix expands from nineteen to twenty operations with `plan_explain`, `reconcile_required` authority and `explanation_intent` retention.
- Week Fold keeps plan ID/revision/key in React page memory, replaces consent/generate controls during uncertainty and reads only that run. A completed mismatch is refused; an old revision can enter history but cannot appear current.
- The AI card uses a compact amber `ORIGINAL REQUEST → STATUS` rail rather than freezing unrelated plan decisions. This is a provider-run pause, not a plan-write pause.
- One reviewed 390 × 844 artifact keeps the target revision, no-new-call promise and one foreground read action visible.

## 3. Implementation method

### Close the history-correlation gap

The immutable history is plan-scoped but intentionally omits idempotency keys. A new run on the same revision could therefore be mistaken for the lost response. The new status projection queries the durable row by owner, plan and original key, so its completed explanation is exact rather than inferred by revision, timestamp or content.

### Keep recovery read-only at the provider boundary

The GET path never calls the worker. It may only advance the already-reserved row when its database deadline has passed, using the deterministic `recovery_content` already stored under ADR-0023. The status path cannot create consent or mutate a weekly plan/health fact.

### Keep consent and request intent in foreground memory

The page retains the exact target revision and key only for the visible attempt. While unresolved, it replaces the consent checkbox and generate button with copy stating that the existing authorization is already bound. Nothing is stored for process/page reload, and no background retry is scheduled.

### Refuse stale or mismatched display authority

The client accepts completed content only when returned plan ID and revision equal the retained tuple. If the current plan changed meanwhile, the explanation remains an old history item and the current note stays empty. Not-found and mismatch states terminate without a replacement POST.

### Prove response loss after real completion

Playwright lets the fixture-worker-backed POST return 201 and persist in PostgreSQL, aborts the browser response, observes the amber exact-run state, then invokes the GET projection. Request counters remain one POST and one GET, and the validated fixture provenance/current revision becomes visible only after that read.

### Rebaseline measured route growth only

H5 total moves from 2,473,823 to 2,478,181 bytes and largest async JavaScript from 198,901 to 198,930; entry remains 318,996. WeApp total/page move from 870,189/45,091 to 875,764/49,310; vendor remains 18,915. Budgets move only to 2,479,000 H5 total, 876,000 WeApp total and 49,500 WeApp page. Existing H5 entry/async and WeApp vendor ceilings remain fixed.

## 4. Validation evidence

- Focused AI contract/workbench validation passed 46 tests; the AI PostgreSQL integration suite passed 5/5.
- Repository-wide unit validation passed 65 files / 331 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict workspace TypeScript and repository formatting passed.
- The complete main H5 browser suite passed 53/53 in 2.8 minutes, including one new real-service explanation response-loss scenario. The dedicated OIDC suite passed 3/3 after its required OIDC-mode rebuild; the repository now retains 56 browser tests.
- API, H5 OIDC and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,478,181 bytes, entry 318,996 and largest async JavaScript 198,930; WeApp total 875,764, vendor 18,915 and largest page 49,310 (`pages/plans`). Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-060-ai-explanation-reconciliation-mobile.png`.

## 5. Problems found and experience captured

- Plan-revision history alone cannot correlate an interrupted AI request because multiple immutable runs may target the same revision. Recovery needs the original key or a server-issued request token.
- Replaying the same POST is server-idempotent, but a dedicated GET makes the no-new-provider-call guarantee explicit and independently testable.
- A status read is sensitive once it contains completed content; its cache policy must be part of the endpoint acceptance, not left to browser defaults.
- Showing a checked disabled consent button made Taro render the label too faint. Replacing the whole control group with bound-request copy is clearer and avoids inviting a second authorization.
- The first targeted browser run reused a stale local API process and correctly returned route 404. Resolving the exact listener/process and restarting only this project's API restored source/build parity.
- The first OIDC rerun used the normal dev-auth H5 build and therefore entered Today. Rebuilding with `build:h5:oidc` restored all three identity tests; authentication-mode artifacts must never be treated as interchangeable.
- Full E2E refreshed historical screenshots. Every tracked test-generated change was restored; only the new iteration-060 artifact remains.

## 6. Global state review, remaining risks and next step

Every currently implemented Week Fold write/provider action now has explicit ambiguous-response authority. AI recovery is exact for the lifetime of the page, but intentionally disappears on reload because persisting a consent-bearing provider request would require a separately designed retention and custody model. Local fixture proof does not establish real-provider timeout/cost/retention quality, physical radio loss, multi-device behavior, WeChat accessibility or hosted exact-SHA evidence.

Iteration 061 should expose the already-retained immutable AI explanation history as a bounded provenance ledger. It must distinguish current/stale plan revisions, label model/fixture/fallback and validator/prompt/failure provenance, avoid provider secrets or regeneration and prove owner isolation plus mobile/wide accessibility. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 059 archive](059-plan-workout-link-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0009](../architecture/decisions/0009-review-only-ai-explanations.md)
- [ADR-0023](../architecture/decisions/0023-crash-safe-ai-explanation-lifecycle.md)
- [ADR-0055](../architecture/decisions/0055-ai-explanation-request-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
