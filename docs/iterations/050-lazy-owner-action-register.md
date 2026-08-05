# Iteration 050: Lazy owner action register

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round removes mutable owner action-definition management from the workout recording page and presents it as an action-specific view in the existing lazy owner-register route.

Success requires create/correct/archive and 10-at-a-time immutable revision history to remain available; returning to refresh active choices without losing the open workout draft; selected and saved workout snapshots to remain unchanged after correction/archive; no new medical, suitability or planning claim; full H5/WeApp/browser validation; and an actual reduction from the prior 50,338-byte largest WeApp page.

This round adds no API, migration, cloud service, external provider, real credential, dataset import, training prescription or calorie target.

## 2. Structure, technology and design state

- `pages/workouts` retains active starter/custom search, one-click snapshot selection and workout recording. Definition form APIs/state/styles and the revision ledger are removed.
- `pages/exercise-catalog` is an action-specific owner-register implementation with an isolated model and proportional unit tests. It renders through the existing registered `pages/food-catalog` lazy route when `kind=exercise` is present, avoiding a second H5 page runtime.
- The register provides new/correct/archive, explicit equipment/tracking/category choices, archive confirmation, active definitions and the shared progressive `DefinitionRevisionLedger`.
- `useDidShow` refreshes only active action definitions after navigation. Taro keeps the workout page instance and therefore its unsaved title, sets, times and selected snapshots.
- Food and action registers share the established paper/register visual vocabulary and CSS. Action copy distinguishes mutable definitions from immutable workout facts and states that user-entered content is not suitability or safety validation.
- Browser fixtures now derive a loopback-only API origin from one runtime helper. The main Playwright server passes the selected port to the API and administrator BFF, so another local application may keep port 3100 without allowing fixtures to write to a remote service.

Technology remains TypeScript strict mode, Taro 4/React, the existing NestJS owner-definition API, shared contracts, Vitest, PostgreSQL 18 and Playwright. No runtime dependency was added.

## 3. Implementation method

### Preserve the draft by preserving page ownership

The action register uses `navigateTo`, not redirect or page reload. The existing workout component and its draft state stay below it in the Taro stack. `navigateBack` exposes that exact instance again; `useDidShow` replaces only `catalogItems` with a fresh active list. This gives corrected future choices without rehydrating or mutating already copied exercise snapshots.

### Keep mutable definitions in their own model

Action form draft construction, alias parsing, equipment validation and request building moved out of `workout.model.ts`. The workout model still owns catalog filtering and conversion from a selected definition to an independent exercise draft. Unit tests separately prove search behavior, explicit request construction, required `other` notes, duplicate-label rejection and copied equipment arrays.

### Reuse the lazy owner route instead of duplicating runtime

The first implementation registered a new Taro page. It reduced the workout bundle but raised H5 total to 2,566,891 bytes and failed the unchanged 2,450,000 gate. Routing the action-specific view through the existing owner-register page removed that duplicated route runtime. Reusing the food register layout classes then removed duplicated CSS while retaining distinct action content.

### Tighten the page budget after measuring

Final H5 measures 2,447,176 total bytes, 318,996 entry bytes and 206,946 largest async JavaScript, all below unchanged ceilings. WeApp measures 810,931 total bytes, 18,915 vendor bytes and 45,512 largest page JavaScript. The total ceiling moves narrowly to 811,000 for the new owner-register shell, while the page ceiling tightens from 50,500 to 45,700. The workout page itself is 39,297 bytes and the shared owner-register page is 30,176 bytes.

## 4. Validation evidence

- Focused action-register/workout model validation passed 2 files / 10 tests.
- Repository-wide unit validation passed 62 files / 272 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict TypeScript, repository formatting, API/admin/H5/WeApp production builds and client forbidden-runtime scanning passed.
- Main browser validation passed 40/40 on isolated API port 3110; dedicated OIDC passed 3/3, for 43 browser cases.
- The action lifecycle proves draft title preservation across create/return, active catalog refresh, snapshot selection, saved-workout immutability after correction, R2/R1 history and archive removal without history rewrite.
- AI service tests passed 7/7; explanation evaluation passed 12/12 and food-photo evaluation passed 11/11.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Client quality measured H5 `2,447,176` total, `318,996` entry and `206,946` largest async bytes; WeApp `810,931` total, `18,915` vendor and `45,512` largest page bytes.
- Reviewed browser evidence is `output/playwright/iteration-050-lazy-exercise-catalog-mobile.png`.

## 5. Problems found and experience captured

- A source-level extraction is not automatically a total-bundle optimization. Each newly registered H5 route carries runtime overhead, so both per-page and whole-tree gates must be measured before accepting a split.
- Sharing a navigation destination can still provide distinct product views. A strict local mode plus separate components/models preserves domain boundaries without registering duplicate runtime.
- Return refresh and draft preservation are different responsibilities: the current active catalog must refresh, while already copied draft facts must not.
- Taro H5 can render inactive-button text with insufficient inherited contrast; explicit token-based inline color on the two secondary action controls supplied reproducible visual proof.
- Full browser suites must not assume ownership of a common local port. A single configurable API-origin authority prevents tests, direct request fixtures, the client build and administrator BFF from drifting.
- A 120-second integration timeout was too small on this Windows host; the unchanged suite passed 62/62 with a wider execution window.

## 6. Global state review, remaining risks and next step

All current collections and direct user-facing revision streams remain bounded. Owner action and food definitions now share one lazy register runtime, while workout recording no longer carries definition governance. The nutrition page is the measured WeApp maximum at 45,512 bytes; H5's 206,946-byte largest async route and 318,996-byte entry remain close to their gates.

Iteration 051 should move optional food-photo consent/upload/proposal/review out of the nutrition recording page. It must keep photo and unconfirmed candidate data outside the recoverable meal-draft vault, return only an explicit user-confirmed candidate to the still-open draft, retain revoke/expiry/deletion behavior and reduce the measured largest page. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 049 archive](049-stable-weekly-plan-history-pagination.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [ADR-0046](../architecture/decisions/0046-stable-definition-history-pagination.md)
- [ADR-0048](../architecture/decisions/0048-lazy-owner-action-register.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
