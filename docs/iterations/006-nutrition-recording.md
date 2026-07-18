# Iteration 006 — Nutrition recording

Date: 2026-07-18

State: complete for the authenticated manual-meal loop

## 1. Scope

Re-anchor after structured workouts on the final primary manual record domain: let an authenticated adult find or define food, confirm a portion, see deterministic energy/macronutrient totals, favorite/reuse common entries, correct the meal with history and remove it from daily views.

Success criteria:

- Strict meal/item/food/serving contracts preserve display units and canonical grams with per-100g nutrient snapshots.
- Server calculations scale and sum energy, protein, carbohydrate, fat and fiber without inventing values from other macros.
- Create is idempotent; replace/delete are owner-only, optimistic and auditable.
- Search, recent foods, server-owned favorites, custom foods and repeat-meal support common entry without copying old time/note.
- Mobile and wide H5 communicate reference uncertainty without food morality; H5 and WeApp production builds pass.
- Unit/contract/model, real-PostgreSQL integration and production-browser lifecycle tests pass.

Rollback boundary: one additive migration introduces meals, items, favorites and revisions. No photo upload, barcode provider, dietary prescription, plan target, public deployment or real user data enters scope. Browser fixtures are cascade-deleted by exact development identity.

## 2. Changes made

- Added shared nutrition constants and Zod schemas for meal types, food categories, display units, food and serving snapshots, lifecycle responses, favorites and history.
- Added deterministic domain functions that scale each per-100g snapshot by canonical grams and sum five nutrient fields with stable rounding.
- Added migration `0005_nutrition_meals.sql`: normalized current meals/items, owner favorites, per-user idempotency, range/order checks and append-only JSON revisions.
- Added transactional NestJS meal create/list/replace/delete/history and favorite list/upsert/delete operations. Stale versions return `409`; cross-user probes return `404`; changed-key replay conflicts and deleted keys cannot resurrect meals.
- Added a shared Taro H5/WeApp meal notebook with breakfast/lunch/dinner/snack selection, searchable demonstration catalog, favorites/recent views, custom per-100g entry, actual portion and approximate-gram display, live kcal/P/C/F summary, note, repeat, edit, delete confirmation and audit sheet.
- Connected Today's “饮食” quick action and estimated lunch action to the real route. Regenerated OpenAPI and expanded enum/schema drift checks.
- Added contract/domain/client-model tests, real-PostgreSQL lifecycle coverage and mobile/wide production-browser scenarios. ADR-0006, nutrition model, architecture, design, roadmap and status record the boundary.

Implementation method: snapshot the food data that informed the user, calculate from canonical grams at the server, and persist current relational rows plus immutable aggregate evidence in one transaction. Favorites reuse the same validated snapshot contract; recent foods stay a projection. Repeat creates a fresh draft and ordinary idempotent meal instead of cloning database identity.

Design impact: warm amber and a faint preparation-grid accent distinguish meals while retaining the paper/mineral/juniper system. Food cards show portion and kcal before adding; actual amount, approximate grams and P/C/F stay together after adding. Copy explicitly avoids “good/bad” scoring and warns that brand, cut and cooking change composition.

## 3. Validation evidence

- `pnpm test`: 16 files and 52 unit/contract/model tests passed. Nutrition coverage validates strict positions/timezones/ranges, per-100g scaling, direct label-energy handling, 393 kcal starter composition, canonical serving grams, empty/invalid drafts and repeat reset semantics.
- `pnpm typecheck`: contracts, domain, design tokens, client and API passed.
- `pnpm test:integration`: 4 files and 12 PostgreSQL tests passed. Nutrition creates/replays a 393 kcal chicken/rice meal, persists a favorite, lists it, changes rice from 150g to 200g for 458 kcal, rejects stale/cross-user access, reads revisions, soft-deletes and retains history; zero canonical grams are rejected.
- `pnpm --filter @myfitness/api openapi:generate`, `pnpm build:api`, `pnpm build:h5` and `pnpm build:weapp`: passed. H5 retains the known non-blocking 302 KiB base-entry warning; nutrition remains a 101 KiB route chunk. WeApp retains the known cache warning.
- `pnpm test:e2e`: all 8 Chromium scenarios passed against the production H5 build, current NestJS API and PostgreSQL. Nutrition mobile exercised favorite `PUT 200`, create `POST 201`, repeat `POST 201`, update `PUT 200`, history `GET 200` and delete `DELETE 204`; its wide scenario validated the balanced empty editor/ledger. Onboarding, measurements and workouts also passed, and every browser error array was empty.
- Final formatting passed. Direct PostgreSQL counts for users, measurements/revisions, workouts/revisions, meals/revisions and favorites were all zero after the complete regression.
- Visual evidence: [mobile nutrition history](../../output/playwright/iteration-006-nutrition-mobile.png) and [wide nutrition editor](../../output/playwright/iteration-006-nutrition-wide.png).

## 4. System status update

- Client: Today shell, adult onboarding and body/recovery, workout and nutrition record lifecycles now share one Taro H5/WeApp codebase. Today values and trends are still fixtures.
- Identity/API: local server-owned sessions and all three primary record-domain lifecycles are operational. Verified production identity, abuse controls, shared staging and operations remain.
- Data/domain: meals now preserve food/portion snapshots, canonical grams, deterministic nutrient summaries, favorites, idempotency, optimistic concurrency, soft deletion and immutable revisions.
- Privacy/safety: only explicit manual/imported meal sources exist. Photo AI cannot write confirmed food facts. Demo composition values are clearly labeled and block public release until a source decision.
- Testing: 52 unit/contract/model, 12 real-PostgreSQL integration and the existing plus new production-browser flows. Type checks, OpenAPI and API/H5/WeApp builds pass.
- Deployment: local PostgreSQL/API/H5 are reproducible. No public endpoint, production identity, secrets system, monitoring, catalog license or regulatory release evidence exists yet.

This round completes the MVP's explicit manual evidence domains without claiming an approved nutrition database, therapeutic recommendations, photo recognition, real Today aggregation or production readiness.

## 5. Risks / open issues

- The ten starter foods contain representative demonstration values, not an approved/localized catalog. Public beta is blocked on provider coverage, version IDs, attribution/license, localization and refresh behavior.
- Household units depend on approximate grams; packaging or weighed values are more reliable. The UI shows “≈”, but editing the grams conversion separately is not yet exposed.
- Custom food keys are local snapshots without deduplication or branded variants. Barcode search and catalog reconciliation need explicit source/version rules.
- Energy/macronutrient totals can be sensitive for users with disordered-eating risk. The existing audience exclusion needs a real screening/escalation and content review before adaptive nutrition planning.
- The client displays stale-write errors but no reload/compare flow; offline queuing and restart-safe idempotency remain open.
- Soft-deleted meal/favorite history is still sensitive data. Privacy erasure must cover revisions and backups.
- 390 px and 1440 px are reviewed; 320 px, large text, keyboard traversal, reduced motion and full offline states remain.
- The H5 base entry remains about 302 KiB versus webpack's 244 KiB recommendation; CI budgets and vendor splitting remain.

Experience captured: a food record should freeze the evidence used at that moment, not point at a catalog row that can mutate later. Canonical grams are a calculation basis, not a promise of portion accuracy. Store label energy rather than reverse-engineering it from macros. Recent items are best kept as a projection until independent behavior is needed. A demonstration catalog must be named as such in UI, documentation and release gates; plausible numbers are not provenance. Separating future image proposals from confirmed meal mutations keeps AI uncertainty from leaking into facts.

## 6. Next step

Primary: Iteration 007 will replace the Today fixtures with authenticated aggregation. It will combine today's confirmed measurements, workouts and meals, calculate plan-versus-actual state and 7/30/90-day domain trends, and add loading/empty/offline/error coverage without generating an AI plan yet.

Deferred candidates:

- Licensed/localized food and barcode providers.
- Deterministic weekly training/nutrition plan generation.
- AI explanation, food/body photo assistance, production identity and public deployment.

They remain sequenced so trends and later planning are grounded in the now-complete explicit record domains.
