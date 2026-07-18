# Iteration 007 — Real Today and trend loop

Date: 2026-07-18

State: complete for confirmed-record aggregation

## 1. Scope

Replace Today fixtures with an authenticated, timezone-aware projection of confirmed body/recovery, workout and meal evidence plus deterministic 7/30/90-day windows. Do not generate a plan or AI narrative.

Success required real local-day ordering, evidence-based/null readiness, untruncated 90-day queries, explicit empty/error states, H5/WeApp builds, unit/integration/browser evidence and one archived commit.

## 2. Changes made

- Added shared dashboard/readiness/evidence/trend schemas and `GET /v1/insights/dashboard`.
- Added direct 91-day PostgreSQL reads: confirmed measurements, completed-set workout summaries and portion-scaled meal totals.
- Added a pure aggregation function for local calendar days, latest three-day recovery factors and 7/30/90-day totals.
- Replaced the static Today fixture with live authenticated loading, empty/error, chronological evidence rail, three trend tabs and truthful safety copy.
- Removed the obsolete fixture and its fixture-only tests; added deterministic aggregation and browser tests.
- ADR-0007 and global product/design/architecture status now describe the projection boundary.

Implementation method: source tables remain the truth; SQL reduces bounded aggregates and a pure function applies timezone and display rules. No dashboard row is persisted. Readiness reverses stress/soreness, averages available 1–5 factors and returns no number when none exist.

Design impact: the Rhythm Rail now contains only confirmed facts. Empty Today gives one next action, recovery shows an em dash instead of invented confidence, and trend cards say “观察窗口，不是目标或处方”.

## 3. Validation evidence

- `pnpm test`: 16 files / 51 tests passed; dashboard tests cover timezone ordering, 80-point recovery, active-day windows and absent evidence.
- `pnpm typecheck` and `pnpm test:integration`: passed; 4 files / 12 PostgreSQL tests include fixed-time dashboard evidence.
- API, H5 and WeApp production builds passed; H5 keeps the known 302 KiB entry warning and WeApp keeps the non-blocking Taro cache warning. The committed OpenAPI document was regenerated and its route test passed.
- Full Chromium: 10/10 onboarding, body/recovery, workout, nutrition and Today scenarios passed. The seeded Today case verifies `80`, `/5`, confirmed evidence and trend totals; the wide case waits for the real null-readiness response.
- Browser error collection now classifies response URL/status and permits only the documented initial `GET /me/onboarding` 404; all other HTTP, request, console and page errors still fail the flow.
- Post-run PostgreSQL counts are zero for users, health records, workouts, meals and favorites.
- Visual evidence: [mobile real Today](../../output/playwright/iteration-007-today-mobile.png) and [wide empty Today](../../output/playwright/iteration-007-today-wide.png).

## 4. System status update

- All primary manual record domains and Today are now real API/PostgreSQL flows on H5/WeApp.
- Today returns confirmed evidence and bounded deterministic trends; it does not yet compare against a stored plan.
- Production identity, catalog provider, privacy operations, monitoring and public infrastructure remain absent.
- The next data consumer can use one server projection rather than client-specific list joins.

## 5. Risks / open issues

- Readiness is a simple unvalidated equal-weight summary; it must remain labeled as such and become versioned before plan decisions depend on it.
- Ninety-day aggregate queries are bounded and indexed by source time, but query plans/load tests and caching are not yet measured.
- Dashboard text is currently Chinese presentation copy in the API projection; localization may require raw reason codes.
- Offline cache, refresh/retry control, daily boundary tests across DST zones, 320 px and large-text review remain.
- A real plan does not exist, so “plan versus actual” is deliberately not claimed.

Experience captured: pagination endpoints are not analytics inputs. Calendar-day grouping belongs with an explicit timezone. Missing health evidence must produce absence, never a neutral-looking fabricated score. Browser seeding should assert every API response—the first run exposed a short-name/full-metric-code mismatch immediately. Final screenshot review also caught an internal `score_1_5` unit and an empty-state capture taken before loading completed; both were corrected before commit.

## 6. Next step

Iteration 008: implement a deterministic, versioned weekly plan contract and engine using onboarding constraints plus the dashboard projection. Add substitutions, training-load/energy guardrails, professional-clearance blocking and accept/modify/skip history before any model narrative.
