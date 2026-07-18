# Iteration 005 — Structured workout recording

Date: 2026-07-18

State: complete for the authenticated manual-workout loop

## 1. Scope

Re-anchor after the body/recovery lifecycle on one additional trustworthy evidence source: let an authenticated adult record an ordered exercise/set session, reuse the last structure without copying old facts, correct it with version history and remove it from the daily log.

Success criteria:

- Strength, cardio and mobility sets share strict contracts for position, completion, repetitions/load, duration/distance and optional RPE.
- Server calculations normalize kg/lb and include only completed sets in volume, distance and active time.
- Create is idempotent; replace/delete are owner-only, optimistic and auditable.
- Repeat-last creates a fresh draft with completion and session feedback reset.
- Mobile and wide H5 make completion, units, partial sessions, safety copy and revision history legible; H5 and WeApp production builds pass.
- Unit/contract/model, real-PostgreSQL integration and production-browser lifecycle tests pass.

Rollback boundary: one additive migration introduces workout tables. No AI, training prescription, nutrition, device import, custom catalog, public deployment or real user data enters scope. Browser fixtures are deleted by exact development identity after every test.

## 2. Changes made

- Added shared workout constants and Zod schemas for session source/status, ordered exercises, set kinds, kg/lb input, strength/cardio/mobility facts, summaries, lifecycle responses and history.
- Added pure domain normalization and summary functions. The API is authoritative for canonical kilograms and completed-set volume/distance/duration; the client preview uses matching draft logic for immediate feedback.
- Added migration `0004_workout_sessions.sql` with normalized current session/exercise/set tables, strong range/pairing/order constraints, per-user idempotency and append-only JSON revisions.
- Added transactional NestJS create/list/replace/delete/history operations. Changed-key replay conflicts, stale versions return `409`, deleted idempotency keys cannot resurrect data and cross-user resource probes return `404`.
- Added a Taro H5/WeApp training logbook: starter exercise catalog, ordered set grid, kg/lb choice, completion controls, reps/time/load/distance/RPE, fatigue/pain/note, live completed-set summary, pain warning, repeat-last, edit, delete confirmation and audit drawer.
- Connected the Today training quick action and planned workout action to the real route. Regenerated committed OpenAPI and added schema-drift coverage.
- Added contract/domain/client tests, a real-PostgreSQL workout lifecycle suite and two production-browser scenarios. ADR-0005, workout model, architecture, design review, roadmap and status document the boundary.

Implementation method: validate the aggregate at contract and database edges; normalize/derive values in a deterministic domain package; persist the current graph plus immutable snapshot in one transaction. Replacement rebuilds bounded child rows instead of allowing ambiguous partial patches. Repeat is a client-side projection of a saved record into a fact-reset draft, then follows ordinary idempotent creation.

Design impact: the training page extends the paper/mineral/juniper logbook with a composed set ledger. Monospaced repetitions, load and volume make scanning precise; completion uses both a check mark and filled shape. Wide H5 keeps the editor and record ledger side by side; mobile uses a focused bottom history sheet. Safety language separates discomfort escalation from diagnosis and explicitly says volume is not “the higher the better”.

## 3. Validation evidence

- `pnpm test`: 13 files and 43 unit/contract/model tests passed, including set-shape constraints, IANA time/order rules, lb normalization, completed-only summaries, repeat reset behavior and database-enum drift.
- `pnpm typecheck`: contracts, domain, design tokens, client and API passed.
- `pnpm test:integration`: 3 files and 10 PostgreSQL tests passed. Workout coverage creates a mixed lb/cardio aggregate, checks canonical `359.25 kg`, replays idempotently, lists, replaces, rejects stale/cross-user access, reads ordered snapshots, soft-deletes and retains history; invalid time order is rejected.
- `pnpm --filter @myfitness/api openapi:generate`, `pnpm build:api`, `pnpm build:h5` and `pnpm build:weapp`: passed. H5 retains the known non-blocking 302 KiB base-entry warning; workout code is route-chunked. WeApp retains the known non-blocking webpack cache warning.
- `pnpm test:e2e`: all 6 Chromium scenarios passed against the production H5 build, current NestJS API and PostgreSQL: onboarding mobile/wide, body-record mobile/wide and workout mobile/wide. The workout lifecycle returned `POST 201`, repeat `POST 201`, `PUT 200`, history `GET 200` and `DELETE 204`. Browser error arrays were empty and every fixture user cascaded cleanly.
- Final `pnpm format:check` passed. PostgreSQL remained healthy and direct counts for users, health records/revisions and workout sessions/revisions were all zero after the complete regression.
- Visual evidence: [mobile workout history](../../output/playwright/iteration-005-workouts-mobile.png) and [wide workout ledger](../../output/playwright/iteration-005-workouts-wide.png).

The lifecycle proves `360 kg` for the default three completed `10 × 12 kg` sets, repeats them as `0/3` incomplete until explicitly checked, then corrects the first set to 12 reps and observes `384 kg` at revision 2. This verifies both user-visible semantics and server-derived storage rather than only rendering a fixture.

## 4. System status update

- Client: Today shell, adult onboarding, body/recovery records and manual workout lifecycle operate on one Taro H5/WeApp codebase. Today aggregation remains a fixture and nutrition remains absent.
- Identity/API: local server-owned sessions plus onboarding, measurement and workout authenticated lifecycles are operational. Verified production identity, abuse controls and shared staging remain.
- Data/domain: workouts now have explicit ordered exercise/set facts, display/canonical loads, deterministic summaries, idempotency, optimistic concurrency, soft deletion and immutable snapshots.
- Privacy/safety: workout completion stays user-confirmed; repeat does not copy prior completion or symptoms. Soft delete is not privacy erasure, and this feature does not prescribe training or diagnose pain.
- Testing: 43 unit/contract/model and 10 real-PostgreSQL integration tests plus the existing and new browser flows. Type checks, API/H5/WeApp builds and OpenAPI generation pass.
- Deployment: Docker PostgreSQL, API and H5 preview remain reproducible locally. No public endpoint, production identity, secrets platform, monitoring or release filing exists yet.

This round completes the second trustworthy record aggregate without claiming rest-timer completeness, plan generation, device sync, AI coaching or production readiness.

## 5. Risks / open issues

- The client derives status from completion, while the API accepts explicit status; imports must not create mismatched states. A future contract refinement can make the server derive status exclusively.
- Replacement rebuilds bounded exercise/set rows. This is clear and transactional for current limits, but high-frequency live-session autosave would need a measured write strategy.
- The starter catalog is fixed client data. Custom exercises, aliases, equipment, unilateral load, assisted load, tempo, supersets and rest intervals need explicit modeling rather than note-field conventions.
- Start/end default to the current draft window; editing exact timestamps and backdated sessions is not yet exposed.
- Stale edits show a safe server error but no compare/reload interface. Offline queuing and restart-safe idempotency remain open.
- Soft-deleted revision snapshots retain sensitive behavior data. Public erasure must define purge, backup and provider handling.
- 390 px and 1440 px are reviewed; 320 px, large text, keyboard traversal, reduced motion and full offline states remain design gates.
- The H5 base entry remains about 302 KiB versus webpack's 244 KiB recommendation; route/vendor budgets still need CI enforcement.

Experience captured: repeat-last is a data-safety feature as much as a shortcut—copy structure, never yesterday's completion or symptoms. Derived metrics need one server authority and domain tests; client previews should mirror them but cannot be trusted for persistence. Normalized current state plus bounded full replacement keeps later analytics queryable, while immutable snapshots preserve exactly what a user saw at each revision. End-to-end assertions against concrete volume changes catch mistakes that status-only tests miss. Visual audit sheets are strong evidence, but their blurred scrim means a separate wide empty-state capture remains useful for layout review.

## 6. Next step

Primary: Iteration 006 will implement nutrition recording. It will define foods, serving snapshots, meal items, manual/search/favorite entry, deterministic energy/macronutrient totals, corrections/history, authenticated ownership and mobile/wide E2E evidence.

Deferred candidates:

- Real Today aggregation and the deterministic plan engine.
- Training rest timer, custom exercise catalog and plan/workout linkage.
- AI explanation, body/food photo assistance, verified production identity and public deployment.

They remain behind complete explicit record domains so planning and AI are grounded in user-reviewable facts rather than invented inputs.
