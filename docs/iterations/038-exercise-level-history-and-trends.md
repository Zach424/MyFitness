# Iteration 038 — Exercise-level history and trends

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 037 established stable starter/custom exercise identities and immutable workout snapshots, but users still had only whole-workout totals. The bounded critical-path question for this round was whether the system could present one exact movement's recent evidence without merging same-name identities, counting incomplete intention or leaving stale values after a correction/deletion.

Success requires an owner-scoped stable-key endpoint; completed-only 7/30/90-day session/set/repetition/volume/duration/distance totals; bounded, timezone-rendered per-session points with recorded snapshot fields and workout revisions; exact correction/deletion recomputation; cross-owner isolation; a compact H5/WeApp flow; explicit missing-evidence and non-prescriptive copy; OpenAPI agreement; and all repository gates to remain green.

This round does not calculate estimated strength, personal-best coaching, movement quality, automatic progression, adherence, diagnosis or treatment. It does not call a real provider, import an external corpus or perform owner-operated cloud work.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` exports one shared exercise-key grammar plus strict exercise insight identity/window/point/response/query schemas. Newly accepted workouts reject duplicate exercise keys so one session cannot create ambiguous points.
- Migration `0024_exercise_insight_index.sql` adds `(workout_id, exercise_key)` lookup support without creating another sensitive-data table.
- `apps/api/src/insights` adds `GET /v1/insights/exercises/:exerciseKey`. PostgreSQL computes full summary windows and a separately bounded recent series from current non-deleted workout rows.
- `apps/client` adds a lazy `pages/exercise-insights` route. Workout entries link with an exact stable key; the page disambiguates same visible names, switches 7/30/90-day evidence, charts one unit at a time and lists the newest full metric/revision facts.
- The committed OpenAPI document, ADR-0036, workout/architecture/design models, roadmap, README and project status describe the same projection and safety boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. The change adds no runtime dependency, external API, paid service, photo or new persisted sensitive-data category.

## 3. Implementation method

### Query identity, not labels

The endpoint accepts only a stable `exerciseKey`; no query or UI grouping uses display name. Each response point carries the name, category, tracking mode, equipment and optional note that were saved with that workout. The top-level identity is simply the newest returned snapshot. Equal current labels remain separate selector choices with a short key suffix.

New workout requests also require exercise keys to be unique within one aggregate. This makes a session point unambiguous and aligns the API with the existing client rule that one movement can be added once. The SQL still groups recent rows by workout and selects the first positioned snapshot defensively if pre-rule data contains duplicate keys.

### Treat completed sets as the evidence boundary

The summary query crosses `VALUES (7), (30), (90)` with owner/current/time-bounded workout rows and the exact exercise key. Only completed set rows join the metric sums; a session counts only when such a row exists. The recent query retains total set count but uses `HAVING` to omit exercises with zero completed sets. This preserves a truthful `2/3` partial record without letting the uncompleted third set inflate any metric.

Volume uses stored canonical kilograms times repetitions. Duration and distance are returned as minutes and kilometers with bounded rounding. The UI chooses volume, time or distance from the latest recorded tracking mode and never plots unlike units on one axis; the evidence ledger still exposes all fields.

### Recompute corrected current state

No projection table is persisted. Workout replacement already rebuilds the current relational exercise/set graph transactionally while appending immutable audit history; soft deletion already excludes the current row. The insight endpoint therefore reflects the new workout revision or disappears after deletion while the workout history remains available through its own boundary.

The database returns complete summaries but limits recent rows to 181, allowing the API to emit at most 180 and an explicit `hasMore`. Each occurrence time is rendered to a local calendar date only after the IANA timezone is validated; membership and ordering use the source instant.

### Use measured budgets to shape the screen boundary

The first working implementation embedded the complete panel in the workout ledger. It passed behavior tests but made the WeApp workout page `46,242` bytes, above the `45,000`-byte gate. The implementation was split into a dedicated lazy route; the final largest WeApp page is `39,472` bytes.

Adding a route raised total lazy H5 assets, so only the total-tree ceiling moved from 1.75 MB to 1.85 MB after measurement. H5 entry, largest asynchronous JavaScript, WeApp total/vendor/page ceilings and forbidden-runtime scans stayed unchanged. The workout page now has small per-exercise observation links, while the dedicated screen has enough space for identity, window totals, a one-unit chart and revision evidence.

## 4. Validation evidence

- Focused unit validation passed 6 files / 18 tests across contracts, workout invariants, API aggregation/OpenAPI and client selection/window behavior.
- Focused PostgreSQL integration passed 1/1. It proves same-name/different-key isolation, incomplete-set exclusion, 7/30/90 totals, timezone date, workout revision correction, soft-deletion recomputation, cross-owner emptiness and invalid-key rejection.
- Repository-wide unit validation passed 49 files / 217 tests.
- PostgreSQL integration validation passed 14 files / 55 tests.
- Strict TypeScript passed across all six product/shared workspaces. API production build and committed OpenAPI generation passed.
- Main H5 browser validation passed 26/26 and the separate OIDC suite passed 3/3, for a 29-case browser inventory. The new 390 × 844 flow records `2/3` completed sets while an incomplete `99 kg` set is excluded, verifies `240 kg`, corrects a completed load, reopens the projection and verifies `270 kg · 训练 v2` with zero captured page/console errors.
- H5 and WeApp production builds passed. Client quality measured H5 `1,816,986` total bytes, `312,858` entry bytes and `190,360` largest async JavaScript; WeApp `689,221` total bytes, `18,915` vendor bytes and `39,472` largest page JavaScript. All remain below the reviewed budgets with no forbidden validation-runtime markers.
- `pnpm audit:prod` passed the critical/high gate with 9 known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-038-exercise-trend-mobile.png`.

## 5. Problems found and experience captured

- A display name is presentation, not identity. Stable keys must drive aggregation even when two buttons look alike or a directory definition is later renamed.
- “Recorded” and “completed” are different evidence states. Keep total sets visible for context, but gate session counts and every performance sum on completed sets.
- Current insight and immutable audit history serve different questions. Trends should follow the corrected current record; revision history should retain what was previously accepted.
- A bounded series and a complete summary are compatible. Calculate window totals over all eligible rows, then independently cap detailed points and disclose truncation.
- Timezone affects the visible calendar date, not source ordering or elapsed-window membership. Tests need a fixed `at` instant to prove boundaries reproducibly.
- Snapshot labels/equipment should travel with each point. A live catalog lookup would rewrite history even if numeric grouping remained stable.
- Bundle budgets should influence architecture. Splitting a dense evidence surface into a lazy route restored the WeApp page gate; changing only the affected H5 total-tree limit retained meaningful entry/route/page pressure.
- A trend is not a recommendation. Higher volume can reflect technique, load, repetition, recording or context changes; the product must not automatically tell a user to add weight from this projection.

## 6. Global state review, remaining risks and next step

The workout loop now moves from reusable definition, to completed set evidence, to exact-movement observation while preserving owner isolation and correction semantics. It still does not validate movement safety, unify differently keyed aliases, evaluate technique or prescribe progression. Real screen readers/WeChat devices, licensed localized exercise content, cloud custody, telemetry ownership, real identity/providers and policy review remain open external gates.

The next largest local product gap is nutrition data ownership: the starter food catalog remains demonstration data and favorites cannot define a missing local food. Iteration 039 should add an owner-created food catalog with explicit per-100-g facts, visible user-confirmed provenance, idempotent correction/archive, immutable meal snapshots and privacy export/erasure coverage. It must not present user-entered nutrients as verified provider data or generate intake prescriptions. Managed deployment remains parked until the user supplies account, budget, domain, identity, custody, telemetry and policy owners.

## 7. References

- [Iteration 037 archive](037-user-owned-exercise-catalog.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0005](../architecture/decisions/0005-structured-workout-aggregate.md)
- [ADR-0007](../architecture/decisions/0007-server-dashboard-aggregation.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [ADR-0036](../architecture/decisions/0036-stable-key-exercise-insights.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
