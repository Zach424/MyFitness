# Iteration 036 — Explicit plan-to-workout linking

Date: 2026-08-04

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 035 made every input that currently changes `deterministic-v1` visible, but plans and actual workouts were still disconnected. The bounded critical-path question for this round was whether the product can truthfully show planned versus recorded state without inventing adherence from similar titles, timestamps, duration or exercises.

Success requires an owner-initiated link between one exact accepted plan-session revision and one exact current workout revision; database and service ownership enforcement; rejection of stale plan/workout/profile/evidence, unadopted plans, empty days and conflicts; no mutation of either source aggregate or its history; reversible unlink with retained custody evidence; workout deletion to close rather than orphan the relationship; active projection into Week Fold and Today; portable export and erasure coverage; OpenAPI, PostgreSQL and production H5 behavior to agree; and the normal repository gates to remain green.

This round does not infer adherence, score exercise quality, adapt future load, auto-create a workout from a plan, add external datasets/providers, perform cloud work or claim that a user-selected relationship establishes safe progression.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` defines strict create, active-link and closure-receipt shapes. A link exposes its selected workout revision separately from the workout's current revision.
- Migration `0022_explicit_plan_workout_links.sql` adds composite owner foreign keys, two partial active-uniqueness indexes and a close-with-reason lifecycle.
- `apps/api` validates current plan/workout authority and existing freshness rules, performs idempotent exact replays, projects active links in the weekly-plan list, closes links on explicit unlink or workout soft deletion, and adds every active/closed row to plan inventory/export custody.
- `apps/client` adds a `PLANNED ↔ RECORDED` card and exact-revision check marks in the Week Fold, a planned/recorded Today card, recent-workout choice with no preselection, explicit unlink and page-show refresh for cached Today state.
- OpenAPI, ADR-0034, weekly-plan/workout models, design review, roadmap, README and project status describe the same relationship.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. The change adds one relational table and no runtime dependency, paid service, external API, dataset or sensitive-data category.

## 3. Implementation method

### Keep the relationship separate from both aggregates

Adding nullable plan fields to the full workout replacement contract would let an older client remove a link by omission. Writing completion into plan JSON would make an immutable proposal depend on later facts. `plan_workout_links` is therefore its own owner-controlled relationship with the exact plan ID/revision/session date and workout ID/revision. Plan and workout revision snapshots remain byte-for-byte about their own aggregates.

The database repeats service ownership with `(plan_id, user_id)` and `(workout_id, user_id)` foreign keys. Partial indexes permit only one active workout for an exact session revision and only one active plan relationship per workout. The plan and workout rows are locked before conflict inspection, so different-workout and different-plan races serialize at their shared authority row.

### Reuse existing plan safety authority

Creation requires `accepted`, not merely generated or modified, content. The session date must exist and contain a session. The server then reruns current profile, eligibility and `planning-impact-v1` evidence checks before locking the owner’s current non-deleted workout revision. Cross-user plan/workout IDs are hidden as `404`; stale authority is `409`; unadopted/empty-day input is `422`. An exact repeated request returns the existing link, while any one-to-many ambiguity requires unlink first.

Later workout edits do not move the historical binding: the projection shows `workoutRevision` and `currentWorkoutRevision`. A regenerated or newly decided plan similarly leaves an older revision link labeled as old. Partial actual workouts are allowed and retain the server-derived `partial` label; link existence never upgrades completion.

### Close, export and erase without losing correction evidence

Unlink sets `unlinked_at`, `unlink_reason=user` and advances the link revision. Workout soft deletion performs the same closure transactionally with `workout_deleted`. The endpoint returns a strict closure receipt. This changed from an initial `204` after real Chromium emitted both a successful response and `net::ERR_ABORTED` for the Taro XHR; a `200` receipt removes that ambiguous transport state.

Privacy inventory counts link records with plans, and each exported plan includes all active and closed link rows. Account erasure deletes them through the user cascade, while normal unlink never destroys them.

### Show only confirmed reconciliation

The Week Fold lists recent workouts only after a current plan is accepted and never preselects one. One user click changes the selected day to a check and displays both revisions plus explicit “not inferred” copy. Today selects only an accepted current plan session for its local date and labels it planned until an exact-revision active link exists. Returning from Plan initially showed a cached Today snapshot; using the Taro page-show lifecycle fixed the stale cross-page state. Dashboard and plan reads remain parallel for responsive refresh, while a shared in-flight session promise prevents duplicate first-load credential exchange.

## 4. Validation evidence

- Focused contract/client validation passed 2 files / 11 tests, covering strict revisions/dates/status and exact-versus-old revision projection.
- Strict TypeScript passed across all six product/shared workspaces; API/OpenAPI generation and API production build passed.
- Repository-wide unit validation passed 46 files / 206 tests.
- PostgreSQL integration validation passed 12 files / 52 tests. The new case proves unadopted, plan-revision-stale, evidence-stale, cross-owner and foreign-workout rejection; exact replay; current workout revision projection; user unlink; relink; and workout-deletion closure reason/revision.
- Main H5 browser validation passed 24/24; together with the separate three-case OIDC suite retained by the repository, the browser inventory is 27. The new 390 × 844 flow adopts a plan, creates an actual workout, proves no automatic selection, links it, verifies the Week Fold and Today, returns to the relationship and unlinks it with zero captured request/page/console errors.
- H5 and WeApp production builds passed. Client quality measured H5 `1,673,170` total bytes, `312,571` entry bytes and `189,661` largest async JavaScript; WeApp `655,845` total bytes, `18,915` vendor bytes and `39,180` largest page JavaScript. All remain below checked-in budgets with no forbidden validation-runtime markers.
- `pnpm audit:prod` passed the critical/high gate with 9 known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-036-plan-link-mobile.png`.

## 5. Problems found and experience captured

- Relationships with independent lifecycles deserve their own model. Hiding them in either aggregate creates accidental replacement semantics and muddled revision ownership.
- “Explicit” must hold at every layer: no preselected candidate, no client similarity helper, no server fallback query and no projection from timestamps.
- Store the revision selected at confirmation and project the current revision separately. Rewriting the bound revision after an edit would erase what the user actually confirmed.
- Database owner foreign keys are necessary even when every service query is owner-scoped; application checks alone do not protect future imports or maintenance paths.
- Soft-deleting a referenced aggregate must close active relationships in the same transaction or uniqueness rules can trap the user behind an invisible orphan.
- Cached multi-page clients need page-show refresh, not only mount-time loading. The real browser exposed the gap only after navigating Plan → Today.
- Parallel first-load reads need single-flight credential acquisition: serializing product data hides the race but degrades the visible navigation path.
- Calendar-sensitive browser evidence must derive the seeded availability from the product timezone; a fixed weekday list made the Today assertion depend on which side of midnight the suite ran.
- A nominally successful `204` can still be an ambiguous H5 transport artifact. Returning a small validated closure receipt gives the client positive completion evidence and avoids Chromium/Taro `ERR_ABORTED` noise.
- Export/inventory and account erasure are part of feature completion for user-owned relationship data, not cleanup for a later privacy round.

## 6. Global state review, remaining risks and next step

The record/plan loop can now distinguish planned from owner-confirmed actual sessions while preserving both histories. This closes a truthfulness gap, but it does not establish adherence quality or justify automatic load changes. Recovery freshness remains coarse, catalogs remain demonstrations, and real screen readers/WeChat devices, cloud custody, telemetry ownership, real identity/providers and policy review remain open.

Iteration 037 should stay local and replace the fixed exercise-only recording boundary with a user-owned custom exercise catalog plus explicit equipment semantics. Starter entries must remain versioned demonstrations; catalog corrections must not rewrite old workout/plan snapshots; ownership, reuse, export and erasure require PostgreSQL and H5/WeApp proof. Managed deployment moves to iteration 038 because its account, budget, domain, identity, custody, telemetry and policy inputs require the user or designated owners.

## 7. References

- [Iteration 035 archive](035-bounded-record-evidence-plan-freshness.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0005](../architecture/decisions/0005-structured-workout-aggregate.md)
- [ADR-0008](../architecture/decisions/0008-deterministic-plan-before-ai.md)
- [ADR-0030](../architecture/decisions/0030-server-authoritative-workout-status.md)
- [ADR-0033](../architecture/decisions/0033-bounded-record-evidence-plan-freshness.md)
- [ADR-0034](../architecture/decisions/0034-explicit-plan-workout-link.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
