# Iteration 003 — Adult onboarding, identity and consent

Date: 2026-07-18

State: complete for the local identity/onboarding boundary

## 1. Scope

Re-anchor on user ownership before building more record screens. This round replaces the spoofable demo-user header with a server-resolved session principal and implements an adult profile flow that records planning constraints, risk exits and purpose/version consent through the real API.

Success criteria:

- A local-only identity adapter issues opaque Bearer sessions, persists no raw token and is disabled in production.
- Protected onboarding and health-record routes derive user ownership from the authenticated principal.
- Profile, goal, availability, equipment, unit preference, timezone, risk state and active consent versions persist transactionally.
- Concurrent profile changes use optimistic revision checks; consent acceptance remains immutable.
- The Taro client creates or updates a profile through the API on both H5 and WeChat build paths.
- Risk selection leads to a professional-clearance state with non-diagnostic copy.
- Unit, contract, database integration, H5/WeApp build and real-browser happy/error evidence pass.

Rollback boundary: this round adds one reversible SQL migration, local development sessions and browser fixtures. It creates no production identity, public endpoint, provider account or real health profile. Browser-created users were queried as evidence and then deleted by exact UUID; the PostgreSQL volume remains intact.

## 2. Changes made

- Added provider-neutral `users`, `auth_identities` and `auth_sessions`; a NestJS guard hashes Bearer tokens, checks expiry and injects the server-owned principal.
- Added `POST /v1/auth/dev/session`. Stable subjects map to stable users, each call returns a new seven-day opaque token, only its SHA-256 hash is stored, and production mode rejects issuance.
- Removed `x-demo-user-id` from health-record routes and converted their integration tests to authenticated, isolated users.
- Added shared Zod onboarding schemas for adult confirmation, age band, estimation sex, height/unit, timezone, primary goal, experience, weekdays, session duration, equipment, dietary preference, risk flags, exact consent versions and optimistic revision.
- Added deterministic height normalization and eligibility rules in `packages/domain`.
- Added migration `0002_users_onboarding.sql` for revisioned profiles, current goals and append-only consent events, with database enum/shape/range constraints.
- Added transactional `GET/PUT /v1/me/onboarding`; updates lock the current profile, reject stale revisions, normalize height and never rewrite existing consent events.
- Added a three-step Taro flow—basics, sustainable rhythm, safety/authorization—with API session storage, existing-profile hydration, adult/consent controls, risk exit copy and mobile/wide layouts.
- Added build-time API URL injection so H5 and Mini Program do not depend on a browser `process` global.
- Split small onboarding constants into a package subpath so client types remain shared without bundling Zod; the H5 page chunk fell from about 452 KiB to 78.5 KiB.
- Added Playwright configuration, a repeatable H5 preview server and two production-browser E2E scenarios.
- Regenerated committed OpenAPI and added ADR-0003 plus the identity/profile model document.

Implementation method: identity adapters terminate at one provider/subject table and issue the same opaque session principal. Controllers never accept user IDs. One transaction owns profile/goal/consent consistency, while the client sends an expected revision. Contract, deterministic domain and SQL constraints overlap on safety-critical fields. The UI treats risk screening as a workflow gate, not medical inference.

Design impact: onboarding uses numbered logbook sheets and the existing mineral/juniper/paper palette. A wide explanation rail states why each data class is needed; mobile keeps one reading column. Selection combines fill, border and text. Risk copy explicitly pauses future personalized planning and asks for qualified professional clearance without asserting a condition.

## 3. Validation evidence

Automated, build and runtime evidence:

- `pnpm test`: 9 files and 28 unit/contract tests passed.
- `pnpm typecheck`: contracts, domain, tokens, client and API passed.
- `pnpm test:integration`: 2 files and 8 PostgreSQL tests passed, covering missing/invalid Bearer tokens, hash-only storage, stable subject ownership, stale consent, adult profile creation/read/update, risk transition, immutable consent count, revision conflict, production issuer denial and cross-user health-record isolation.
- `pnpm --filter @myfitness/api openapi:generate`: committed OpenAPI contains development session, readiness, health-record and onboarding paths with Bearer security.
- `pnpm build:api`, `pnpm build:h5` and `pnpm build:weapp`: passed. H5 retains one non-blocking 302 KiB Taro entrypoint budget warning; the onboarding feature chunk is 78.5 KiB.
- `pnpm test:e2e`: 2 Chromium tests passed against the listening production H5 build, NestJS API and PostgreSQL. Mobile completed the full risk/consent submission; wide H5 verified the explanation rail. Final browser error arrays were empty.
- Database evidence for the E2E response: revision `1`, `professional_clearance_required`, `{chest_pain}`, `fat_loss`, `60` minutes, a 64-character session token hash and exactly 3 consent purposes. The evidenced profile and identity-only browser fixtures were cascade-deleted by exact UUID; the final `users` count is `0`.
- Visual evidence: [mobile risk/consent state](../../output/playwright/iteration-003-onboarding-mobile.png) and [wide basics state](../../output/playwright/iteration-003-onboarding-wide.png).

Browser review caught two issues that static checks did not: `process.env` caused a page-only runtime crash until replaced by a build constant, and changing Taro Button loading/child structure during save caused a DOM reconciliation error until the action structure was stabilized. Both fixes are covered by the final zero-error E2E run.

Reference checks followed current official guidance: NestJS guards are the request authorization boundary and its authentication guide demonstrates Bearer-token protection; Nest database guidance supports transaction-owned persistence; Zod 4 emits OpenAPI-targeted JSON Schema. See [NestJS guards](https://docs.nestjs.com/guards), [NestJS authentication](https://docs.nestjs.com/security/authentication), [NestJS database techniques](https://docs.nestjs.com/techniques/database), and [Zod JSON Schema](https://zod.dev/json-schema).

## 4. System status update

- Client: real adult onboarding is operational on the shared H5/WeApp code path; the Today rail and record actions are still fixture-backed.
- Identity/API: server-owned opaque sessions, authenticated resources, profile/goals/risk/consent and committed OpenAPI are operational locally. Verified production identity is not.
- Data/domain: measurements, height normalization and adult eligibility exist. Workout, nutrition, recovery aggregates and photo models remain.
- Privacy/safety: active purpose/version acceptance and risk exits persist; revocation, export, deletion, retention and legal review remain.
- Testing: 28 unit/contract, 8 real-PostgreSQL integration and 2 production-browser E2E tests. Formatting, type and three production builds pass.
- Deployment: local services and preview are repeatable; there is no shared staging or public environment.

This round establishes who owns every subsequent record and why the first sensitive profile data may be processed, without claiming production login, complete privacy operations or medical safety certification.

## 5. Risks / open issues

- The development session issuer is intentionally not production authentication. It fails closed in production, but verified WeChat/phone identity, account linking, recovery, revocation, rate limits and abuse controls are still required.
- Raw tokens are absent from PostgreSQL, but browser storage remains exposed to client-side compromise; production H5 needs hardened CSP, secure deployment and session management.
- Consent acceptance exists without revocation or policy renewal workflows. Legal language and jurisdiction-specific handling are placeholders pending review.
- Risk flags are self-reported workflow gates, not validated clinical screening. Planning must remain paused on any flag until a reviewed clearance flow exists.
- The wide and 390 px states are reviewed; 320 px, large text, keyboard traversal, reduced motion and offline/retry states remain open.
- The base H5 Taro entrypoint is about 302 KiB, above webpack's 244 KiB recommendation. Feature runtime bloat was removed, but route/vendor budgets still need CI enforcement.
- OpenAPI describes structural schemas; cross-field rules such as dietary `none` exclusivity rely on executable contract tests and documentation.

Experience captured: type-only imports do not necessarily prevent runtime bloat when a CommonJS package barrel also exports values; a small explicit subpath restored tree-shakable client constants. Production-browser checks must navigate the same Taro route and submit against a real database—screenshots alone missed both the environment-global crash and reconciliation error. Expected “profile missing” requests also create noisy browser 404s, so the client now recognizes a first local identity before attempting hydration. Stable DOM structure is safer than toggling framework-specific loading children during a routed Taro save.

## 6. Next step

Primary: Iteration 004 will implement body and recovery recording against the authenticated health-record API. It will add create/list/edit/delete/history screens, unit/timezone correctness, idempotent create, optimistic edit conflicts, confirmed-versus-estimated visual states, ownership tests and mobile/wide E2E coverage.

Deferred candidates:

- Workout and nutrition record domains.
- Deterministic plan engine and real Today aggregation.
- Verified production identity, AI worker, photo upload and public deployment.

They remain sequenced behind a complete manual recording loop so AI and deployment do not outrun trustworthy user-owned data.
