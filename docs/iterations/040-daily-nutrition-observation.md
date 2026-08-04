# Iteration 040 — Daily nutrition observation with explicit missing evidence

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The nutrition aggregate could save correction-safe meal snapshots and the dashboard could show broad totals, but the user could not inspect a continuous daily record. Iteration 040 adds one bounded read projection and one dedicated client page for 7/30/90 local calendar days.

Success requires a strict shared contract; exactly 90 timezone-aware dates; current non-deleted meal evidence only; future-event exclusion at a reproducible reference instant; explicit missing days; nullable unknown fiber; correction/deletion recomputation; owner isolation; a compact H5/WeApp view; OpenAPI agreement; and all repository gates to remain green.

This round does not add calorie or macro targets, adherence, streaks, food scores, comparisons, recipes, provider data, medical interpretation or dietary recommendations. No new sensitive state is persisted.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts/src/insights.ts` now defines strict daily/window nutrition evidence schemas. Cross-field checks reject zero-filled missing days, impossible record counts and invented fiber totals.
- `apps/api/src/insights` adds `GET /v1/insights/nutrition`. PostgreSQL generates 90 local dates and aggregates current meal-item snapshots through a parameterized owner/timezone/reference-instant query.
- `apps/client/src/pages/nutrition-insights` is a dedicated lazy route reached from the meal ledger. Its 7/30/90 controls, metric selector, evidence ribbon, coverage note and seven-day ledger all preserve the difference between recorded, missing and unknown.
- The client view model owns window slicing, recorded-day averages and deterministic four-level evidence shading. The API remains the source of dates, counts and totals.
- ADR-0038, the nutrition/architecture/design models, roadmap, README, OpenAPI and project status describe the same non-prescriptive observation boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. No runtime dependency, migration, cloud account, external data source or real provider was added.

## 3. Implementation method

### Generate local dates before joining facts

The query converts the reference instant into one requested local date, generates that date plus the previous 89 dates, and then left-joins owner meals by `(occurred_at AT TIME ZONE timezone)::date`. It also keeps an index-friendly lower timestamp bound and rejects meals later than the reference instant. The response is chronological and always contains 90 points.

Saving a meal is the confirmation boundary for nutrition: unsaved editor drafts and food-photo candidates never enter `nutrition_meals`. Both manual and imported saved snapshots are user-owned records and are included. A replacement rewrites only the current relational item graph; a soft deletion removes the meal from ordinary reads. The insight therefore recomputes without a second table or invalidation job.

### Preserve uncertainty instead of manufacturing zero

Daily energy, protein, carbohydrate and fat are numeric only when at least one meal/item exists. With no meal they are `null`, while record counts are zero and `hasEvidence` is false. Contract refinements enforce those relationships.

Fiber remains optional on each frozen food snapshot. The query returns both known-fiber item count and total item count, sums only known values and returns `null` if none are known. Window totals preserve the same coverage. The page states the fraction directly and never treats an absent label as 0 g.

### Make the record gap the visual signature

The page uses an **Evidence Ribbon** rather than a goal ring. Each local date is a compact cell: four restrained Juniper levels show relative recorded amounts within the selected window, diagonal hatching means no record and a dot means the selected nutrient is unknown. The ribbon remains useful when all values are missing or zero and exposes each cell with a date-specific accessible label.

Summary cards show recorded days, missing days, saved meals and an explicitly labelled “recorded days only” average. The last seven local dates repeat the distinction in text. No green/red threshold, streak, target, percentile or advice appears.

### Keep bundle pressure measured

The dedicated route avoids adding a second dense projection to the meal editor. Its addition moved H5 total output from 1,946,951 to 2,070,342 bytes and WeApp from 707,840 to 724,085 bytes. Reviewed total ceilings move to 2.10 MB and 735 KB. H5 entry, largest async JavaScript, WeApp vendor and largest page-JavaScript ceilings remain unchanged and green.

## 4. Validation evidence

- Focused contract, service and client-model validation passed 3 files / 10 tests. It proves explicit null missing days, fiber coverage, 90-day slicing, recorded-day averages and bounded mapping.
- The new PostgreSQL integration passed 1/1. It proves 90 local dates, Shanghai midnight grouping, future-event exclusion, current-row correction, soft-deletion recomputation, owner isolation and invalid-timezone rejection.
- Repository-wide unit validation passed 51 files / 226 tests.
- PostgreSQL integration validation passed 16 files / 58 tests.
- Strict TypeScript passed across all six product/shared workspaces. API production build, committed OpenAPI generation and H5/WeApp production builds passed.
- Main H5 browser validation passed 28/28 and the dedicated OIDC build passed 3/3, for 31 browser cases. The new mobile flow saves a meal, opens the observation, proves 30 then 7 explicit cells, checks the 1/6 recorded/missing split, changes to fiber and captures no page/console errors.
- Client quality measured H5 `2,070,342` total bytes, `313,186` entry bytes and `190,232` largest async JavaScript; WeApp `724,085` total bytes, `18,915` vendor bytes and `39,472` largest page JavaScript. No forbidden validation-runtime marker returned.
- `pnpm audit:prod` retains the zero critical/high gate with the known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-040-nutrition-observation-mobile.png`.

## 5. Problems found and experience captured

- A daily chart must model absence as absence. Numeric zero is a measurement, not an empty-state convenience.
- Local calendar windows are not fixed multiples of 24 hours. Generate and group dates in the requested timezone; keep the reference instant explicit for deterministic tests.
- Optional nutrients need coverage metadata. A partial fiber total without its known/total item fraction looks more complete than it is.
- One projection should have one fact source. Current normalized rows make correction/deletion behavior immediate; immutable revisions remain audit history, not simultaneous trend facts.
- “Daily average” is ambiguous when records are incomplete. Divide only by recorded days and put that limitation in the label, contract tests and explanatory copy.
- Equal summary numbers need distinct accessible names. The first browser run found two visible `1` values; semantic labels now name the measure with the number.
- Visual intensity should be relative evidence, not a value judgment. Juniper depth encodes magnitude within the selected period; missing and unknown use pattern/shape rather than alarming colors.
- Route-level budgets continue to influence ownership. A dedicated observation page keeps the already-dense meal editor focused and preserves the 45 KB WeApp page limit.

## 6. Global state review, remaining risks and next step

Nutrition now has a complete local loop from a versioned definition to an immutable meal fact and a correction-safe daily observation. It still cannot establish complete intake, food accuracy, nutritional adequacy or a safe prescription. Missing meals, missing fiber labels and owner-entered values remain visible limitations; eating-disorder content risk remains high.

The next largest locally verifiable product gap is metric-specific body/recovery observation. Iteration 041 should let a user select one exact health metric, preserve canonical/display units and revision provenance, view bounded 7/30/90-day current evidence, and see correction/deletion recomputation without diagnosis, goal grading or cross-user benchmarks. Managed deployment remains parked until account, domain, identity, custody, telemetry and policy owners are supplied.

## 7. References

- [Iteration 039 archive](039-user-owned-food-catalog.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0006](../architecture/decisions/0006-nutrition-snapshot-aggregate.md)
- [ADR-0038](../architecture/decisions/0038-timezone-safe-nutrition-observation.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
