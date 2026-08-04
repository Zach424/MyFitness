# Iteration 034 — Client accessibility and bundle hardening

Date: 2026-08-04

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 033 made stale weekly plans visible before commitment. The next bounded release risk was the client itself: 320 px/system-large-text and keyboard behavior were still open, while every lazy H5 route and the WeApp vendor bundle carried the full shared Zod runtime with no project-owned size gate.

This round hardens the existing client rather than adding a new health feature. Success requires onboarding and the Week Fold to remain free of document-level horizontal overflow at 320 px with 125% root text; the custom AI-consent checkbox to be reachable by Tab, visibly focused and operable by Space/Enter; public identity responses to remain strictly checked without the umbrella validation runtime; actual H5/WeApp measurements to pass checked-in ceilings in CI and release packaging; Taro warnings to stay visible; and focused, full, integration, dual-build, budget and browser regressions to pass.

The round does not claim screen-reader or physical WeChat-device validation, eliminate the Taro framework warning, change plan/AI consent policy, add cloud services, weaken shared server schemas or treat a budget ceiling as a performance guarantee.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` adds dependency-free AI, food-photo, privacy and progress-photo constant subpaths; privacy constants are separated from Zod construction while the root remains backward compatible.
- `apps/client/src/lib/api-response.ts` validates the two public identity responses without a browser Zod dependency; `api.ts` imports only the small food-photo constant at runtime.
- client plan, privacy and progress-photo pages import runtime constants through subpaths; their contract types remain erased root imports.
- the shared accessibility helper adds guarded Space/Enter activation, and the Week Fold's AI consent becomes a real Taro Button with checkbox semantics, one pointer/keyboard transition and visible focus.
- `scripts/client-quality.mjs` plus `apps/client/client-quality-budget.json` measure both production trees, reject unsafe trees/forbidden runtime markers and emit `myfitness-client-quality/v1` evidence.
- main CI and immutable client release assembly run `pnpm client:verify` after both builds.
- the privacy E2E inventory assertion now follows the current merged `照片分析与进度照` category instead of a retired label.
- ADR-0032, README, design review, roadmap and project status record the runtime and release-budget decision.

Technology remains TypeScript strict mode, Taro 4/React, shared Zod server contracts, Node standard-library release tooling, Vitest and Playwright. No dependency, migration, external dataset, GitHub repository, cloud service or paid API was added.

## 3. Implementation method

### Keep validation while removing the umbrella runtime

Type-only contract imports were already erased; three runtime imports from the CommonJS root caused the duplication. Runtime constants now use explicit subpaths. OIDC configuration and verified-session responses use exact-key guards that mirror URL, string length, array bounds, UUID, provider, boolean and offset-datetime constraints. Unknown fields fail closed, so bundle reduction does not turn identity responses into unchecked casts.

The client-quality verifier reads H5 entry assets from the generated index rather than trusting a changing numeric chunk name. It measures full trees, the largest async route, WeApp vendor and page JavaScript, rejects symlinks/path escape and scans all JavaScript for two full-runtime markers. Strict budget keys prevent an ignored typo. Ceilings retain only bounded headroom over the accepted build and run in both quality and publication workflows.

### Repair Taro custom-element keyboard behavior

Changing the consent wrapper from `View` to `Button` improved semantics but the real browser proved that `TARO-BUTTON-CORE` still did not synthesize click on Space. The compatibility helper therefore handles non-repeating Space/Enter, calls `preventDefault` and invokes the same eligibility-guarded toggle as pointer input. Disabled, repeated and unrelated keys do nothing. The control keeps `role=checkbox`, `aria-checked`, `aria-disabled`, a 44 px target and the existing paper-card visual language.

### Test narrow width and enlarged text as product behavior

The production H5 preview ran at 320 × 720. The responsive root was raised from about 32.82 px to 41.03 px, representing 125% text. Onboarding and the complete Week Fold both reported document `scrollWidth=320` and `innerWidth=320`. Shift+Tab then Tab returned focus to the AI checkbox; computed focus was a 3 px solid outline; Space changed `aria-checked` from false to true and enabled the explanation action.

## 4. Validation evidence

- Focused accessibility, identity-response and quality-verifier validation passed 3 files / 20 tests. It covers exact/expanded response shapes, Space/Enter, disabled/repeat/irrelevant keys, both measured trees, oversize failure and forbidden-marker failure.
- Strict TypeScript passed across all six product/shared workspaces; repository formatting passed.
- Repository-wide unit validation passed 46 files / 200 tests.
- PostgreSQL integration validation passed 12 files / 50 tests.
- The first full E2E run passed 19/22. Two administrator cases used a stale local `.next` build, and one privacy assertion still expected a pre-progress-photo inventory label. Rebuilding administrator production output and updating that assertion produced focused 2/2 and 3/3 passes, followed by a clean full 22/22 run.
- Production H5 and WeChat Mini Program builds succeeded. The final quality report measured H5 `1,654,236` total bytes, `312,571` entry bytes and `189,303` largest async JavaScript; WeApp `643,335` total bytes, `18,915` vendor bytes and `39,180` largest page JavaScript. All are below the checked-in ceilings and both forbidden-runtime marker sets are empty.
- The release-specific OIDC H5 build independently passed the same gate at `1,653,056` total bytes, `312,571` entry bytes and `189,082` largest async JavaScript, including its callback assets.
- Before the import split, the same trees measured about 5.66 MB H5 total / 633 KB largest route and 1.12 MB WeApp total / 427 KB vendor. The remaining H5 305 KiB webpack advisory and Taro dynamic-import/cache messages stayed visible.
- Playwright CLI production-browser evidence is `output/playwright/iteration-034-onboarding-320-large.png`, `iteration-034-plan-keyboard-320-large.png` and `iteration-034-plan-consent-focus.png`.

## 5. Problems found and experience captured

- Type-only imports do not create bundles; one runtime import through a CommonJS umbrella can. Package boundaries must be audited at runtime granularity.
- Removing a schema for size is the wrong trade. Small exact guards preserve a public trust boundary while server schemas remain authoritative.
- A semantic role and tab stop do not guarantee keyboard activation on framework custom elements. Real key events and computed focus must be checked.
- Browser proof caught the failed Space behavior after the first semantic fix and forced a second, correct implementation before documentation.
- A generated numeric H5 chunk name is not a durable control. Deriving entry assets from `index.html` avoids a brittle budget.
- A green targeted client suite can coexist with a stale production build and stale E2E copy. Rebuild provenance and current user-facing labels are part of reproducibility.
- Budget gates should expose, not replace, upstream warnings. The project ceiling prevents regression while the framework entry advisory remains a named risk.

## 6. Global state review, remaining risks and next step

The client no longer duplicates the full shared validation runtime across every route, and both release targets now have a measured publication gate. The highest-impact known custom checkbox is keyboard-operable at the narrow text-scaled boundary. This is release hardening, not complete accessibility certification.

Remaining risks include real screen readers/WeChat devices, the H5 framework entry, other routes at text extremes, record-evidence plan freshness, starter catalogs, real provider/cloud custody, telemetry ownership and policy review. Iteration 035 should stay local and define a bounded evidence fingerprint/policy so materially changed recent workout/recovery/nutrition evidence can prompt review without making every new record churn the weekly plan. External operator work remains parked but mandatory before beta.

## 7. References

- [Iteration 033 archive](033-proactive-plan-freshness.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0032](../architecture/decisions/0032-client-runtime-and-measured-bundle-boundary.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
- [Client quality budget](../../apps/client/client-quality-budget.json)
