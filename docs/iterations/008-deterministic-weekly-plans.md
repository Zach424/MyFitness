# Iteration 008 — Deterministic weekly plans

Date: 2026-07-19

State: complete for deterministic generation and review

## 1. Scope

Implement one safe, versioned weekly-plan path from current onboarding constraints and confirmed dashboard evidence through generate, substitute, modify, accept, skip and immutable history. Do not add a language model, photo analysis, completion inference or calorie prescription.

Success requires strict shared contracts, a pure deterministic engine, profile/risk gates at generation and decision time, PostgreSQL revisions, H5/WeApp review UI, API/unit/integration/browser validation, updated architecture/design/status archives and one local commit.

## 2. Changes made

- Added strict shared plan enums and Zod schemas for seven days, sessions, activities, substitutions, qualitative nutrition focuses, evidence, decisions and history.
- Added the pure `deterministic-v1` engine: availability-only scheduling, experience/recovery caps, even spacing, easy/moderate intensity, equipment-compatible alternatives and non-prescriptive nutrition focuses.
- Added `weekly_plans` current aggregates and immutable `weekly_plan_revisions` in checksum-protected migration `0006`.
- Added authenticated weekly generate/list/decision/history API routes with ownership, idempotency, optimistic concurrency and structured `409`/`422` failures.
- Re-check eligibility and onboarding revision before accept/modify; changed onboarding regenerates the same weekly aggregate as a new draft revision while skip remains available.
- Added the Plan page and Today navigation: empty/generate state, seven-day “Week Fold”, substitutions, local draft changes, accept/modify/skip actions, reasons/evidence, qualitative nutrition and revision history.
- Added contract/domain/client tests, PostgreSQL lifecycle tests, OpenAPI coverage and three production-browser scenarios.

Implementation method: the database owns current state and history, the API owns authorization and lifecycle transitions, and pure domain functions own repeatable generation/substitution rules. The UI never recreates safety rules or persists an AI-looking narrative.

Design impact: the training-logbook language gains a **Week Fold / 周折页**. Seven compact day tabs expose the week at a glance; selecting a day opens its session and alternatives while the wide view keeps evidence and nutrition beside the plan. Status and selection use text, borders and fill rather than color alone.

## 3. Validation evidence

- `pnpm format:check` and `pnpm typecheck` passed. `pnpm test` passed 19 files / 60 tests; `pnpm test:integration` passed 5 files / 15 PostgreSQL tests; full Chromium passed 13/13 scenarios.
- Unit tests cover schema rejection, generation caps, availability/equipment constraints, recovery reduction, substitutions and client week/decision helpers.
- PostgreSQL integration covers idempotent generation, ownership, modify/accept/skip history, stale revisions, missing onboarding, professional-clearance blocks, changed-profile regeneration and decision-time re-checks.
- Browser flows cover mobile substitution → modify → accept/history, wide responsive rendering and a visible professional-clearance block without unexpected HTTP, console or page errors.
- API, H5 and WeApp production builds passed. H5 retains the known 303 KiB entry-size warning; H5/WeApp retain non-blocking Taro/webpack cache warnings. The committed OpenAPI document was regenerated.
- Post-run PostgreSQL counts are zero for users, health records, workouts, meals, favorites and weekly plans; the checksum runner verifies all six migrations.
- Visual evidence: [mobile accepted plan](../../output/playwright/iteration-008-plans-mobile.png) and [wide weekly review](../../output/playwright/iteration-008-plans-wide.png).

## 4. System status update

- A user with current eligible onboarding can now generate, review, modify, accept or skip an explainable weekly plan on H5 and WeApp.
- Plans retain their evidence/profile provenance and immutable decision snapshots; changed safety constraints cannot silently adopt an older plan.
- The non-AI MVP loop now spans onboarding, body/recovery, training, nutrition, Today/trends and weekly planning.
- Production identity, licensed catalogs, privacy operations, monitoring, shared infrastructure and any AI/photo capability remain absent.

## 5. Risks / open issues

- `deterministic-v1` is conservative and explainable but not clinically or outcome validated; it must not be marketed as individualized professional advice.
- The client does not proactively label a plan stale after a profile/risk update; the server rejects unsafe decisions and regeneration refreshes it.
- Plan activities are not yet reconciled with recorded workouts, so completion/adherence and load progression are unavailable.
- Starter exercise/protein choices are embedded demonstration content without catalog provenance or localization governance.
- Package-local contract tests currently do not match files under the root Vitest configuration; the supported root `pnpm test` gate passes, but script ownership should be cleaned up with CI.
- H5 bundle size, production authentication, rate limiting, observability, privacy export/deletion and 320 px/large-text validation remain release blockers.

Experience captured: PostgreSQL `DATE` values must be serialized as local calendar components rather than converting local midnight through UTC, which can return the prior day in Asia/Shanghai. Safety eligibility must be checked again at the moment a plan is adopted, not only when generated. Browser screenshots should explicitly reset scroll containers before capture. Migration files become immutable once applied because the local runner checksum-protects them.

## 6. Next step

Iteration 009: add an AI explanation/orchestration boundary behind the existing structured plan contract. Start with a provider-neutral gateway, prompt/model/validator provenance, offline fixtures, adversarial safety cases and deterministic fallback; do not write model output directly into confirmed health records.
