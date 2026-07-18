# Iteration 001 — Multi-end client foundation

Date: 2026-07-18

State: complete for the local client-shell baseline

## 1. Scope

Re-anchor on the first-release surface: one shared client must render a calm, explainable Today experience on responsive H5 and compile into a WeChat Mini Program. This round intentionally uses fixture data so platform, design, build, and test foundations can be validated before authentication, persistence, or AI creates extra failure modes.

Success criteria:

- A pinned pnpm workspace installs reproducibly from a lockfile.
- Taro 4, React and TypeScript render a fixture-backed Today shell in H5.
- The same source compiles into a WeChat Mini Program without deleting the H5 artifact.
- Shared tokens have executable accessibility checks.
- Primary controls expose button semantics and one estimated-value interaction gives safe feedback.
- Production output is reviewed at mobile and wide viewport sizes.
- Formatting, peer dependency, unit-test, typecheck and build gates pass.

Rollback boundary: this round adds only local client code, dependency metadata, generated-but-ignored platform artifacts, and screenshot evidence. It creates no account, database, cloud resource, production endpoint, or real health record.

## 2. Changes made

- Created the pnpm workspace, root TypeScript/Vitest/Prettier configuration and a checked-in dependency lockfile.
- Added `apps/client` using Taro 4.2.1, React 18.3.1 and TypeScript 5.9.3, with platform-specific `dist-h5` and `dist-weapp` targets.
- Implemented a responsive Today shell with readiness, the Rhythm Rail, confirmed/planned/estimated states, a plan-reason card, quick actions, navigation and an AI safety note.
- Kept Today content in a typed fixture module and tested its item count, confirmation count and required plan explanation.
- Added `packages/design-tokens` with CSS variables and TypeScript color helpers; tests prove token validity and WCAG AA contrast for primary text/surfaces.
- Added keyboard/button semantics to interactive Taro controls and safe feedback for the estimated lunch action.
- Captured checked-in production screenshots for 390 × 844 mobile and 1280 × 900 wide H5.

Implementation method: package compatibility was resolved from actual peer constraints rather than selecting versions independently. UI structure stays in Taro primitives, tokens stay cross-platform, fixture data stays separate from rendering, and output directories are platform-specific so builds can run in any order.

## 3. Validation evidence

Automated gates:

- `pnpm peers check`: no peer dependency issues.
- `pnpm test`: 2 test files and 6 tests passed.
- `pnpm typecheck`: design-token and client TypeScript projects passed.
- `pnpm build:h5`: production H5 compiled successfully and emitted `index.html`.
- `pnpm build:weapp`: production Mini Program compiled successfully and emitted page/app artifacts.
- Sequential artifact check: rebuilding WeApp left the existing H5 `index.html` checksum unchanged.
- Browser production smoke test: page title and Today content loaded; accessibility snapshot exposed all primary actions as buttons; lunch confirmation feedback rendered.
- Browser console after final reload: 0 errors and 0 warnings.
- Visual review passed at [mobile](../../output/playwright/iteration-001-mobile.png) and [wide](../../output/playwright/iteration-001-wide.png) sizes.

Build observations: H5 compiles with a 300 KiB entrypoint warning; both platform compilers can emit non-fatal webpack cache serialization warnings. These are recorded as performance/tooling risks rather than hidden or treated as functional failures.

## 4. System status update

- Client foundation: partial product capability, complete for this round. The Today shell runs on H5 and compiles for WeApp, but still uses fixtures.
- Design system: implemented and visually validated for the Today-shell baseline; the complete state/accessibility matrix remains.
- Shared packages: design tokens exist; API contracts and health-domain rules remain pending.
- Testing: unit, type, production-build and browser-smoke foundations exist; CI, lint, integration and end-to-end suites remain.
- API, authentication, database, AI, admin, privacy workflows and deployment: not implemented.

This outcome validates the multi-end delivery choice and the product's signature plan-vs-actual interaction without claiming that health records or AI plans are operational.

## 5. Risks / open issues

- GitHub Git transport remains unavailable; this round can be committed locally but cannot yet be replayed/pushed to the provided remote.
- H5's initial entrypoint is 300 KiB versus webpack's recommended 244 KiB. Route growth needs a budget, lazy loading and measured vendor splitting.
- Taro's webpack integration emits cache serialization warnings even though clean production builds pass; package upgrades should be isolated and revalidated on both targets.
- The Mini Program artifact has compiled but has not yet been opened in an authenticated WeChat Developer Tools project or exercised on a physical device.
- The Today screen uses static fixture identity and health values. No value is persisted, synced or produced by AI.
- Remaining visual gates include 320 px, large text, keyboard traversal, reduced motion and complete state coverage.
- Installation reports deprecated transitive packages in Taro's dependency chain; direct dependencies are pinned and peer-compatible, while upstream replacements must be monitored.

Experience captured: Taro's H5 build needs an explicit `src/index.html`; its two targets must not share one cleaned output root; package install scripts need an explicit pnpm allow-list; and accessibility inspection is necessary because visual Taro buttons may otherwise appear as generic nodes in H5. Standard H5 attributes such as `role` are not declared by Taro's cross-platform `ButtonProps`, so they are applied through one typed runtime-attribute spread and verified by both TypeScript and the browser accessibility tree. Taro's generated `.swc` platform binary is a local cache and is explicitly ignored rather than committed.

## 6. Next step

Primary: Iteration 002 will create the NestJS API foundation and shared health-record contract. It will define source/provenance, canonical and display units, occurrence time/timezone, confidence and revision fields; persist them through a PostgreSQL migration; expose an OpenAPI contract; and prove the stack with unit/integration tests and a reproducible local health check.

Deferred candidates:

- Adult onboarding, goals and consent capture.
- Replacing Today fixtures with live API data.
- AI/model integration and image uploads.

They remain deferred until the record contract and persistence boundary are validated.
