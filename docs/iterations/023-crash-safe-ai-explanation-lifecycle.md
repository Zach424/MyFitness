# Iteration 023 – Crash-safe AI explanation lifecycle

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while managed shared deployment remains intentionally gated on owner-controlled infrastructure and credentials

## 1. Scope and success standard

MyFitness remains a privacy-first WeChat Mini Program and responsive H5 fitness record, planning and review product. Iteration 022 made ambiguous account deletion recoverable, but the planned managed deployment still cannot start honestly without an owner-approved account, region, budget, domain, client API URL and protected WeChat/OIDC references. The AI architecture also retained one release-critical lifecycle gap: a process crash after committing a `pending` explanation and before worker completion could strand the row forever, making its idempotency key permanently conflict.

This round pulls that bounded reliability/privacy risk forward. Acceptance requires every new run to persist a database deadline later than the worker timeout plus a validated deterministic recovery result without a stored prompt/context; runtime startup and interval reconciliation; atomic multi-replica claims; one terminal result when a worker races recovery; immediate recovery for an expired idempotent retry; legacy pending-row backfill; aggregate-only private operations evidence; metadata assembly with no background I/O; real blocked-worker, concurrent-reconciler and full regression proof; documentation, ADR and exactly one Conventional Commit.

It does not call a paid model, change AI or plan authority, add medical/nutrition prescriptions, change client UI, provision infrastructure, invent provider credentials, publish a candidate or open traffic. Managed shared deployment is explicitly renumbered to iteration 024 rather than being misreported as complete.

## 2. Structure, technology and design state

New and changed boundaries:

- `infra/postgres/migrations/0017_reconcile_ai_explanation_runs.sql`: adds temporary recovery content, mandatory expiry, a lifecycle constraint, legacy backfill and a partial expiry index.
- `packages/contracts/src/ai.constants.ts`: versions reconciled results as `orchestrator-recovery-v1`.
- `apps/api/src/ai/ai.service.ts`: precomputes recovery, reserves deadlines, reconciles on startup/interval/retry, uses atomic bounded claims and resolves worker/reconciler races to one row.
- `apps/api/src/ai/ai.service.test.ts` and integration tests: prove metadata/runtime policies, blocked worker recovery, two concurrent reconcilers and idempotent terminal reuse.
- `apps/api/src/config.ts` and environment templates: define the timeout separation and polling interval with fail-fast validation.
- `apps/api/src/operations/operations.controller.ts`: adds operations-token-protected aggregate status and bounded manual reconciliation.
- OpenAPI, schema-drift, production-preflight and restore-drill assertions move with the new runtime/database contract.
- ADR-0023, the AI model, API contract, operations perimeter/runbook, project status, roadmap, risk review and this archive describe the implementation and remaining external gates.

The product still uses Taro 4 + React + strict TypeScript, NestJS 11, Zod 4, PostgreSQL 18, Redis, private S3-compatible storage and a FastAPI AI worker. No product screen or design token changed, so the established paper/juniper/navy review-only AI margin-note design and its 23 previously reviewed screenshots remain the visual baseline; this round intentionally adds no screenshot.

## 3. Implementation method

### Make recovery valid before external work starts

The API builds the normal deterministic fallback once from the already minimized plan context, validates it through the existing shared content schema, and writes it with the `pending` reservation. It continues to store only the SHA-256 input fingerprint rather than the prompt or serialized context. `expires_at` is computed by PostgreSQL from a configured stale interval, and configuration refuses any value less than five seconds beyond the worker HTTP timeout.

Migration 0017 backfills completed rows with deadlines needed by the invariant and no recovery copy. Legacy pending rows receive a generic schema-valid explanation and a deadline relative to original creation, making old abandoned work immediately eligible without reconstructing or retaining historical context. A constraint requires pending rows to hold an object recovery value and completed rows to clear it.

### Converge once across restarts, replicas and retries

Runtime API assembly performs one reconciliation on module startup and starts an unreferenced interval; metadata/OpenAPI assembly keeps background work disabled. Each pass clamps its batch to 1–100 and normally processes 50 rows. A common-table expression orders expired work, locks it with `FOR UPDATE SKIP LOCKED`, and atomically promotes the stored recovery result to completed fallback provenance with a bounded latency value.

An identical retry checks the same row under the existing user-scoped advisory lock. If expired, it performs the same conditional terminal transition and returns the result; if not, it keeps the existing in-progress conflict. Normal worker completion updates only a pending row. When reconciliation wins first, completion reads and returns that terminal row rather than inventing a second outcome. Recovery never contacts a provider and cannot alter the deterministic plan.

### Keep operations evidence content-free

`GET /v1/internal/ai-explanations` returns pending, expired and recovery-model completion counts plus the oldest pending timestamp. `POST /v1/internal/ai-explanations/reconcile` runs one bounded pass and returns a count. The existing controller guard requires the independent operations token and both responses are `no-store`; neither route returns a run/user/plan ID, prompt, context or explanation.

## 4. Validation evidence

- Contracts and API type checks passed. Final targeted lifecycle/config/OpenAPI/schema/domain tests passed 5 files / 28 tests, including metadata no-I/O and runtime startup/interval behavior.
- All 17 checksum-protected migrations applied. AI and operations integration passed 2 files / 14 tests; real HTTP requests were held inside the worker call. One aged row was offered to two concurrent reconcilers and exactly one completed it; another was completed by its identical idempotent retry. In both cases the released original worker request returned the same `fallback` / `unavailable` / `orchestrator-recovery-v1` / `provider_timeout` result, and the recovery copy was cleared.
- The complete unit gate passed 36 files / 138 tests. The complete integration gate passed 11 files / 46 tests.
- AI worker tests passed 7/7, plan-explanation evaluation 7/7 and food-photo evaluation 8/8 using fixtures; no paid model call occurred.
- The complete workspace type check and builds passed, including API, administrator, H5 and WeApp production output. Registered H5 305 KiB entry/large-chunk, WeApp 417 KiB vendor and non-blocking Taro cache warnings did not materially change.
- Production dependency audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain advisories.
- Playwright passed 22/22 existing administrator, nutrition/photo, onboarding, plan/AI, privacy, body, Today and workout flows. Generated changes to 18 prior screenshots and the evaluation report were restored to reviewed `HEAD` bytes because this round has no UI change.
- `backup-restore-erasure-v2` restored migration 17, replayed one ledger entry, recreated one provider-identity suppression, erased the restored deleted user and ended with zero restored users, a completed receipt and `ledger_published` disposition.
- The complete deployment smoke passed despite transient registry retry warnings: pinned AI/API/administrator images built, migration completed before traffic, all dependencies and application images became healthy, and the black-box verifier returned all four checks. Smoke and local dependency containers were removed.
- Final formatting, whitespace, OpenAPI freshness, secret scan and staged-file review run after documentation closure. Remote main CI is post-commit evidence rather than predicted here.

## 5. Problems found and experience captured

- Persisting idempotency before external work is necessary but insufficient. A reservation also needs a bounded terminal path that does not depend on the original process surviving.
- Recovery content should be created under the same validator as normal fallback before the risky call. Reconstructing it later would require retaining more context or accepting a weaker schema.
- The recovery deadline must be a database invariant related to the worker timeout. Independent arbitrary defaults can turn a healthy but slow response into premature fallback or leave abandoned work pending too long.
- Startup, interval, idempotent retry and a private manual pass solve different recovery gaps; all can share one atomic database transition rather than separate lifecycle rules.
- `SKIP LOCKED` plus a conditional terminal update makes multi-replica maintenance cheap and deterministic. The normal request still has to accept that maintenance may win and return the stored row.
- Operational recovery must not become a hidden provider replay API. Aggregate-only evidence and deterministic local completion preserve both privacy and cost boundaries.
- External deployment inputs remain a real boundary. Pulling forward a documented critical-path defect creates honest progress without fabricating an account, credential or public deployment.

## 6. Global state review, remaining risks and next step

The record, plan, photo, administrator, privacy, release-manifest, client-artifact and managed-admission boundaries remain intact. AI explanation requests now converge after API process loss, and the project-status pending-run risk is closed with reproducible configuration, unit, integration, restore and deployment evidence. The change does not broaden AI authority: recovered prose remains visibly derived, plan-revision-bound and unable to mutate confirmed data.

Still open: approve/configure the client API address and publish a new candidate; provision managed PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; load real WeChat and OIDC secrets; exercise WeChat request-domain/device login and erasure; select H5 production identity; centralize AI lifecycle/process metrics and alerts with named owners; calibrate capacity/rates; approve an AI provider canary; and run migration, black-box, privacy, restore and rollback proof in the managed environment.

The next controlled step is iteration 024: use owner-provided account/region/budget/domain and protected references, configure the client API variable, publish/download/verify a new immutable service/client candidate, provision shared resources, run admission, deploy services without general traffic, upload the admitted WeApp TAR to private preview, and exercise identity, custody, telemetry, canary and no-traffic rollback. Iteration 025 owns H5 production identity and public-beta hardening; iteration 026 remains the post-retention native/device feasibility gate.

## 7. References

- [ADR-0009](../architecture/decisions/0009-review-only-ai-explanations.md)
- [ADR-0023](../architecture/decisions/0023-crash-safe-ai-explanation-lifecycle.md)
- [AI explanation model](../architecture/AI_EXPLANATION_MODEL.md)
- [API operations runbook](../operations/API_OPERATIONS_RUNBOOK.md)
- [Iteration 022 archive](022-recoverable-account-erasure-receipts.md)
