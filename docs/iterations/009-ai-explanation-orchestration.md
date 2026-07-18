# Iteration 009 — Review-only AI plan explanations

Date: 2026-07-19

State: complete for local fixture, provider adapter, safety validation, and review UI

## 1. Scope

Add one provider-neutral AI explanation path behind the deterministic weekly plan. A user must explicitly consent for the request; the model may explain but never alter the plan, prescribe diet/training, diagnose, or write confirmed records.

Success requires minimized/versioned contracts, a FastAPI worker, fixture and OpenAI Responses adapters, deterministic validators and fallback, persisted provenance/idempotency, a clearly secondary cross-end UI, offline adversarial evaluation, full tests/builds/browser evidence, updated architecture/design/status archives, and one local commit. Food/body photo analysis remains iteration 010.

## 2. Changes made

- Added strict shared AI context, worker, explanation, consent, history, source, failure, prompt, validator and evidence-key contracts.
- Added pure context minimization, schema/evidence/phrase/number validation, and a deterministic fallback in `packages/domain`.
- Added a FastAPI worker with authenticated internal endpoint, health check, no-cost fixture provider, and OpenAI Responses adapter using strict JSON Schema, `store: false`, bounded output, typed refusal/failure handling, timeout, and one transient retry.
- Added migration `0007`: versioned AI consent purpose plus pending/completed explanation runs with ownership, plan revision, idempotency, fingerprint, provenance, usage and completion invariants.
- Added NestJS orchestration routes for generation/history. The API reserves before calling, re-checks current plan/profile/risk eligibility, never persists the raw prompt/input, validates worker output again, and falls back deterministically.
- Added the **AI Margin Note / 计划边注** to Week Fold. It requires an explicit checkbox, labels model/fixture/fallback, exposes grounded evidence tags and safety provenance, has no “apply” action, and hides an old explanation when the plan revision changes.
- Added seven checked-in adversarial evaluation cases and a generated JSON report.

Implementation method: model output is an untrusted proposal crossing two validation boundaries. The weekly plan remains the only decision aggregate; the explanation table is an auditable, revision-bound read model.

## 3. Validation evidence

- `pnpm test` passed 21 files / 66 tests; `pnpm test:integration` passed 6 files / 18 PostgreSQL tests.
- `pnpm test:ai` passed 5 FastAPI/provider tests, including auth, strict payload, retry and refusal handling.
- `pnpm eval:ai` passed 7/7 grounded and adversarial cases and regenerated [the evaluation report](../../output/evals/iteration-009-ai-evaluation.json).
- Full Chromium verification passed 15/15 scenarios, including 2 new AI cases for consent gating, provenance/evidence, fallback-safe copy, stale revision behavior, responsive hierarchy, and zero captured page/console errors.
- Formatting, full-workspace type checks, API, H5 and WeApp production builds passed. H5 retains the known 303 KiB entry and 507 KiB largest-chunk warnings; WeApp reports a 458 KiB plan-page warning and recommends asynchronous splitting.
- The checksum runner applied/verified all seven migrations. Post-run counts are zero for users, health records, workouts, meals, favorites, weekly plans and AI explanation runs; PostgreSQL and FastAPI containers are healthy.
- Visual evidence: [mobile plan margin note](../../output/playwright/iteration-009-ai-mobile.png) and [wide secondary evidence layer](../../output/playwright/iteration-009-ai-wide.png).
- No real/billable OpenAI request was sent. The adapter is verified using `httpx.MockTransport`; local runtime uses `fixture-plan-explainer-v1`.

## 4. System status update

- H5 and WeApp now have a real consented AI orchestration contract without making the product dependent on a model.
- The FastAPI boundary is implemented and runs beside PostgreSQL in local Compose; NestJS remains the data and authorization authority.
- Explanation source, model, prompt, validator, consent and plan revision are inspectable, and provider failure degrades to deterministic copy.
- Production provider enablement, photo analysis, privacy operations, verified identity, monitoring/rate limits, licensed catalogs, CI and shared deployment remain incomplete.

## 5. Risks / open issues

- Real-provider output quality, latency, cost, quotas and account-level retention have not been canary-tested; enabling `AI_PROVIDER=openai` requires owner approval and operational/legal review.
- `store: false` does not by itself establish zero-data-retention or resolve regional processing and privacy disclosure requirements.
- Seven offline cases are a foundation, not a safety claim. Add Chinese obfuscation, prompt injection, expert-reviewed nutrition/training examples and regression thresholds.
- A process crash after reservation can leave a pending run; add expiry/reconciliation before shared beta.
- Consent is recorded but not yet revocable/exportable through the product.
- H5 bundle budget, production authentication, rate limiting, observability, 320 px/large-text and full keyboard traversal remain release blockers.

Experience captured: reserve the durable run before a potentially costly provider call; bind narrative artifacts to the exact source revision; distinguish provider from display source so fixture and fallback never look like model output; store a fingerprint and provenance instead of sensitive raw prompts; mock billable APIs until explicit cost approval; and keep conservative phrase validators versioned because even a harmless negation containing “处方” can be rejected. Taro H5 custom elements also need explicit ARIA roles/disabled state for reliable accessibility and browser tests.

## 6. Next step

Iteration 010: add food-photo assistance as a candidate-only workflow—private signed upload, EXIF stripping, retention deletion, image safety checks, portion/food alternatives with uncertainty, explicit user confirmation, and no automatic nutrition-record write.
