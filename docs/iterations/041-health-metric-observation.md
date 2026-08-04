# Iteration 041 — Exact-metric body and recovery observation

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The health-record aggregate had canonical conversion, corrections, history and a small seven-entry preview, but no bounded metric-level longitudinal surface. Iteration 041 adds one confirmed-only read projection and a dedicated 7/30/90-day client view.

Success requires an exact metric-code contract; owner/current/confirmed filtering; future-event exclusion; canonical-unit statistics; original display/source/timezone/revision provenance; correction/deletion recomputation; AI-candidate exclusion; H5/WeApp behavior; OpenAPI agreement; and all repository gates to remain green.

This round does not diagnose, score readiness, establish normal ranges, grade goals, compare users, infer causality or recommend training/medical changes. No migration, external service or new stored sensitive state is added.

## 2. Structure, technology and design state

- `packages/contracts/src/insights.ts` adds strict health window/point/response schemas. Empty windows must keep statistics null; populated windows require complete canonical statistics.
- `apps/api/src/insights` adds `GET /v1/insights/health/:metric`, two parameterized current-row queries and deterministic mapping into 7/30/90 windows plus a bounded 180-point series.
- `apps/client/src/pages/health-insights` is a dedicated lazy route. The record editor links the active exact metric; the page loads only metrics that have confirmed current records.
- The client view model owns metric choices, elapsed-window point slicing and unit/source formatting. The API owns filters, statistics, reference time and provenance.
- ADR-0039, the health/architecture/design models, roadmap, README, OpenAPI and project status describe the same fact-versus-candidate and unit boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. No runtime dependency, data source, provider or cloud service was added.

## 3. Implementation method

### Keep identity and units exact

The controller validates the path with the shared metric enum. Both queries use that code, owner ID, current-row predicates, confirmed status and reference instant. Window aggregates count records and requested-local dates while calculating minimum, maximum and average only from `canonical_value`. Equal labels or different metrics can never merge.

The latest 181 rows are ordered by occurrence/creation/ID; mapping returns 180 and sets `hasMore` if truncated. Each point separately exposes canonical value/unit and persisted display value/unit. A weight entered in pounds can therefore contribute kilograms to statistics without losing the original pound record.

### Reuse the current correction boundary

The projection reads `health_records`, not immutable revision history. A complete replacement updates the current row and revision; a soft deletion removes it from ordinary reads. Integration proof changes a pound-entered weight from canonical 70 to 72 kg and deletes an older 68 kg record, then observes the window move from `68–70 / avg 69` to only `72`.

An AI estimate candidate for the same metric, a different metric, a future record and another owner's records are independently excluded. No rollup or invalidation path is required.

### Use a calibration strip, not a progress verdict

The dedicated page opens with `ONE METRIC · ONE CANONICAL UNIT`. Its calibration strip places recorded values on one relative scale, while copy says high/low means numeric position only. Summary cards show confirmed record count, recorded dates and recorded-value average marked “not a target.”

The evidence ledger restores original display value/unit and shows canonical conversion only when different, followed by source, occurrence timezone and record revision. No arrows, green/red zones, celebration, normal bands or “improved” language appears.

### Keep client growth measurable

The lazy page moves H5 total from 2,070,342 to 2,199,986 bytes and WeApp from 724,085 to 741,959 bytes. Reviewed total ceilings become 2.25 MB / 750 KB. Entry, async JavaScript, vendor and page-JavaScript ceilings stay unchanged and green.

## 4. Validation evidence

- Focused contract, service and client-model validation passed 3 files / 13 tests, including empty-window nulls, confirmed choice filtering, elapsed boundaries, canonical/display separation and 180-point bounds.
- The new PostgreSQL integration passed 1/1. It proves metric/owner/status isolation, AI-candidate and future exclusion, pound-to-kilogram provenance, correction, deletion and invalid-key rejection.
- Repository-wide unit validation passed 52 files / 231 tests.
- PostgreSQL integration validation passed 17 files / 59 tests.
- Strict TypeScript passed across all six product/shared workspaces. API production build, committed OpenAPI generation and H5/WeApp production builds passed.
- Main H5 browser validation passed 29/29 and dedicated OIDC passed 3/3, for 32 browser cases. The new mobile flow records 72.4 kg, opens exact `body.weight`, verifies counts/strip/source/unit and switches to seven days with no page/console errors.
- Client quality measured H5 `2,199,986` total bytes, `313,346` entry bytes and `190,404` largest async JavaScript; WeApp `741,959` total bytes, `18,915` vendor bytes and `39,472` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-041-health-metric-observation-mobile.png`.

## 5. Problems found and experience captured

- Canonical values support comparison; display values preserve history. A useful projection needs both rather than overwriting one with the other.
- Metric identity belongs to a code, never its translated label. Exact paths prevent accidental same-name or cross-domain merging.
- “Confirmed only” is an executable filter, not UI copy. The database query independently excludes AI candidates even if a caller requests the metric directly.
- Statistics need an explicit empty shape. Null minimum/maximum/average says no evidence; zero would invent a measurement.
- Relative height is not direction. Calibration copy and neutral color prevent a larger soreness/stress score from looking like success.
- Existing numeric persistence rounds display values to four decimals. Integration expectations should validate stored precision, not the request's longer decimal string.
- A separate route keeps the record editor's immediate seven-entry preview while giving provenance and longer windows enough space.

## 6. Global state review, remaining risks and next step

Body, recovery, workout and nutrition records now each have a correction-safe current observation path. None establishes data completeness, measurement accuracy, clinical normality or causality. Subjective 1–5 recovery scores and device/body-composition estimates remain especially easy to over-interpret.

The next locally verifiable reliability gap is recoverable sensitive drafts. Iteration 042 should preserve bounded workout/nutrition/record editor drafts across refresh/crash with a visible saved-at/expiry state, schema-version validation, per-user scoping where identity exists and explicit clearing on save/cancel/logout/account erasure. It must not persist raw photos, auth secrets or stale AI proposals. Managed deployment remains parked pending owner inputs.

## 7. References

- [Iteration 040 archive](040-daily-nutrition-observation.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Health record model](../architecture/HEALTH_RECORD_MODEL.md)
- [ADR-0004](../architecture/decisions/0004-health-record-revision-lifecycle.md)
- [ADR-0039](../architecture/decisions/0039-exact-metric-health-observation.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
