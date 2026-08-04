# Iteration 045 — Timezone-safe cross-domain history calendar

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Today exposed only a single day and domain pages exposed separate ledgers. A user could not see which recent local days contained evidence across body/recovery, training and nutrition, and starting a backfill required re-entering a date. This round adds one bounded cross-domain calendar without turning missing records into a claim about activity, intake or adherence.

Success requires exactly 28 requested-timezone local dates; authenticated owner isolation; current confirmed/non-deleted source facts only; later-than-reference exclusion; correction/deletion recomputation; explicit empty days; source counts rather than scores; H5/WeApp navigation from Today; accessible mobile-first calendar controls; all three backfill routes; date/timezone validation; and save refusal until a real local minute is supplied.

This round adds no rollup table, streak, adherence rule, cloud service, external provider, dataset or medical behavior.

## 2. Structure, technology and design state

- `packages/contracts/src/insights.ts` owns the exact 28-day response/day schemas and reuses the strict IANA-timezone/reference query boundary.
- `apps/api/src/insights` adds the authenticated controller route and one PostgreSQL projection over `health_records`, `workout_sessions` and `nutrition_meals`.
- `apps/client/src/pages/history` owns the lazy H5/WeApp page and its dependency-free totals/date/accessible-label model.
- `apps/client/src/lib/backfill-intent.ts` owns a narrow route intent: one real Gregorian local date, one valid IANA timezone and a zero-to-90-local-day age.
- The three existing editors consume the intent only for a new draft. `OccurrenceField` names a date-only value as incomplete without styling it as a malformed error; the existing request builder still refuses save until `HH:mm` resolves to one valid non-future instant.
- Today adds a single `打开 28 天历史日历` action. The calendar uses a seven-column evidence map, explicit text legend, selected-day summary and three backfill actions. Blank-day and footer copy prohibit score/adherence interpretation.
- The committed OpenAPI document, ADR-0043, architecture, three aggregate models, API guide, design review, roadmap, README and global status describe the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, parameterized PostgreSQL, Vitest and Playwright. No runtime dependency or migration was added.

## 3. Implementation method

### Project local days in PostgreSQL, not in host time

The query uses `generate_series` to produce the local date containing the reference instant plus its previous 27 dates. Each source table converts its occurrence column with `AT TIME ZONE $timezone`, applies the authenticated `user_id`, current/deletion/status boundary and an exact reference-time upper bound, then contributes one count column. A final left join returns all days in strict ascending order even when no fact exists.

The response schema independently requires 28 elements, matching first/last boundaries, ascending dates and `hasRecords` equal to the sum-of-counts truth. No value, nutrient, workout volume or hidden user fact enters the calendar response. Because the query reads current source rows, a corrected occurrence moves days and a deleted aggregate disappears without a synchronization job or new privacy/export category.

### Keep an empty day semantically empty

The UI renders all 28 buttons and gives each an exact accessible label. A recorded cell exposes only `身`, `训` and `餐` source presence; the selected card states counts. An empty cell says “无记录,” and the page repeats that this is an evidence gap rather than zero activity, zero intake or non-completion. No streak, target, rank, adherence percentage or calendar heat judgment is calculated.

### Carry a date without inventing an instant

The navigation helper encodes only `date` and `timezone`. Parsing decodes once, validates the Gregorian date, asks `Intl.DateTimeFormat` to validate/project the IANA zone, and accepts only today or the previous 90 local days. Record, workout and meal pages apply it to their initial new-entry draft; editing, normal resets and post-save state do not retain it.

The date-only field is intentionally a valid backfill state but not a valid occurrence instant. It displays a direct `请补充 HH:mm` note and remains blocked by `occurrenceValidationMessage`/`occurrenceInstant`. The end-to-end flow proves that clicking save produces the precise validation message, then entering a real minute submits and updates the calendar count on return.

### Review bundle and test-time boundaries

The lazy page and styles increased production artifacts beyond intentionally tight total ceilings. Exact measurement grew from iteration 044 by 133,500 H5 total bytes, 1,756 largest-async bytes and 17,906 WeApp total bytes; H5 entry grew only 347 bytes, WeApp vendor stayed unchanged and the largest WeApp page stayed below its existing 48 KB ceiling. With no new dependency or forbidden validation runtime, reviewed ceilings move only to 2,425,000 H5 total, 204,000 H5 async and 795,000 WeApp total bytes.

Full browser validation also exposed an older plan-link fixture that always created today's workout at 10:00. Before 10:00 local time, the correct future-occurrence guard rejected it. The fixture now derives an already elapsed interval inside the planned local day; product validation was not weakened.

## 4. Validation evidence

- Focused contract/service/client-model validation passed 5 files / 24 tests. It covers exact response invariants, totals/labels, Gregorian/IANA/age route validation and date-only occurrence behavior.
- The dedicated PostgreSQL calendar integration passed 1/1. It covers 28-day boundaries, requested-timezone grouping, owner isolation, future exclusion, health correction, workout deletion and invalid timezone rejection.
- Repository-wide unit validation passed 58 files / 262 tests.
- PostgreSQL integration validation passed 18 files / 60 tests.
- Strict TypeScript passed across all six product/shared workspaces; committed OpenAPI generation and repository formatting passed.
- Main H5 browser validation passed 37/37 and dedicated OIDC passed 3/3, for 40 browser cases. The new case creates one fact in every source domain, verifies 28 controls and a blank day, refuses date-only save, accepts an explicit minute and observes the recomputed count after returning.
- API, H5 and WeApp production builds passed. Client quality measured H5 `2,420,757` total bytes, `318,637` entry bytes and `203,766` largest async JavaScript; WeApp `794,393` total bytes, `18,915` vendor bytes and `46,924` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-045-history-calendar-mobile.png`.

## 5. Problems found and experience captured

- A cross-domain date is a presentation boundary, not a new source of truth. Generating dates and joining current facts avoids another correction/deletion synchronization problem.
- “No record” and “zero” are different data states. The distinction belongs in schema shape, visible copy, accessible labels and tests rather than in a disclaimer alone.
- Convenience defaults must not manufacture sensitive facts. Passing a local date while requiring the user to state the minute preserves the practical shortcut and the provenance boundary together.
- A shared query schema must finish its strict/refinement chain before aliases are declared. Focused inspection caught an insertion point that would otherwise have weakened timezone validation for sibling insight endpoints.
- Reusing an already running local server can test stale compiled code. The first 404 was traced to the exact `apps/api/dist/main.js` listener, restarted, and then the same browser flow passed.
- Separate development and OIDC H5 builds intentionally overwrite the same preview root. Identity browser proof must rebuild its candidate mode first, and normal client-quality measurement must restore the standard build afterward.
- Future-time validation makes fixed “today at 10:00” fixtures time-dependent. Browser fixtures should derive an elapsed interval without relaxing the production guard.

## 6. Global state review, remaining risks and next step

Recent cross-domain evidence and careful past-date entry are now connected without adding a behavior score or duplicate storage. The 28-day read is bounded, but the three editor list endpoints still return an owner's entire active history on every open. That will become progressively expensive and can enlarge client state for long-lived accounts.

Iteration 046 should add opaque cursor pagination with stable owner ordering to health records, workouts and meals, then progressively load those lists without breaking correction lookup, repeat/recent helpers, drafts or history navigation. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 044 archive](044-conflict-safe-correction-drafts.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API contract guide](../api/README.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0041](../architecture/decisions/0041-explicit-occurrence-time.md)
- [ADR-0042](../architecture/decisions/0042-conflict-safe-correction-drafts.md)
- [ADR-0043](../architecture/decisions/0043-timezone-safe-history-calendar.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
