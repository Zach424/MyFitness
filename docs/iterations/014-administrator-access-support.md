# Iteration 014 — Administrator access and support

Date: 2026-07-19

State: complete locally for the independent administrator trust-boundary slice; production OIDC tenant, shared deployment, audit retention and access ownership remain open

## 1. Scope and success standard

Build one narrow administrator vertical slice without weakening user ownership: verified/pre-provisioned operator identity, roles split by purpose, append-only access audit, exact account evidence lookup and a restrained read-only support console. This round does not add user impersonation, generic search, content browsing, moderation, database mutation, just-in-time approval, production identity tenant or deployment.

Acceptance required user/admin token non-interchangeability, OIDC signature/issuer/audience/age/nonce/replay checks, production-disabled local issuance, current-role enforcement, audited allowed/denied/not-found paths, database mutation rejection, bounded output, desktop/mobile browser proof, all existing regression, one archive and one local commit.

## 2. Structure and technology state

New/changed repository boundaries:

- `apps/admin`: Next.js 16.2.10 App Router + React 19.2.7 administrator BFF/UI, standalone production output, security headers and Windows production-preview command.
- `apps/api/src/admin`: NestJS operator authentication, session/role guards, audit writer/query, support projection and controllers.
- `packages/contracts/src/admin.ts`: Zod roles, providers, session, OIDC exchange, lookup, summary, audit and cursor contracts.
- `infra/postgres/migrations/0012_admin_support_boundary.sql`: six administrator tables, indexes and immutable-audit trigger.
- `tests/e2e/admin.spec.ts`: exact desktop/mobile support workflow and safe local cleanup guard.
- `docs/architecture/ADMIN_SUPPORT_MODEL.md`, ADR-0014 and `docs/operations/ADMIN_ACCESS_RUNBOOK.md`: boundary, decision and operating lifecycle.
- `docs/api/openapi.json`: independent `adminBearer` scheme and administrator paths.

Dependency graph changes:

- Added `jose 6.2.3` for standards-based JWT/JWKS verification.
- Added Next.js 16.2.10 and React/ReactDOM 19.2.7 only to `apps/admin`.
- Parent-qualified `next@16.2.10>postcss` floor uses patched PostCSS 8.5.19 after the audit exposed Next's 8.4.31 path.
- Workspace now contains seven projects. Frozen install and peer validation remain clean.

## 3. Implemented functions and methods

### Identity and sessions

- Production browser login uses Authorization Code + PKCE, state and nonce in the BFF.
- Production authorization, token and callback URLs are all HTTPS; configured issuer bytes remain exact rather than being slash-normalized.
- API validates ID-token signature through remote JWKS, exact issuer/audience, algorithms `RS256`/`PS256`/`ES256`, ten-minute maximum age, five-second clock tolerance and matching nonce.
- `(provider, issuer, subject)` must already map to an active operator with at least one role.
- Every ID-token SHA-256 hash is inserted once in `admin_oidc_exchanges`; replay fails.
- API issues an independent opaque `mf_admin_*` token; only its SHA-256 hash is stored.
- The BFF places that token in an HttpOnly, SameSite=Strict, secure-by-default cookie. Browser JavaScript sees only same-origin BFF responses.
- Local development can provision a `dev` operator only when the API is non-production. Production returns `404` and writes `dev_issuer_disabled` audit evidence.
- Session authentication reloads operator status and roles on every request; session revocation is explicit and audited.

### Least privilege and bounded support

- `support_reader` may call exact account evidence lookup only.
- `audit_reader` may read bounded newest-first audit pages only.
- A denied role decision appends `authorization.denied`.
- Lookup requires a UUID, 3–40 character ticket reference and one of four enumerated reasons.
- Response includes only lifecycle timestamps/status, provider names, onboarding presence/revision, active session/photo counts, seven aggregate counts, latest activity and optional-consent state.
- Names, provider subjects, health values, workout/meal/plan content, AI prose, photo content and storage identifiers are never selected into the contract.
- Allowed and not-found lookups are transactionally audited; the returned lookup receipt is the audit event ID.

### Immutable access evidence

- Events cover session created/denied/revoked, profile reads, support lookups, audit reads and authorization denials.
- Direct target identifiers become HMAC-SHA-256 references before insertion.
- Detail fields are limited to eight scalar values with bounded keys/strings.
- A PostgreSQL trigger rejects every update or delete on `admin_audit_events`.
- Audit pagination uses a bounded base64url projection of occurrence time and event UUID only.

### Evidence Desk design

The management surface is intentionally an evidence desk rather than an enterprise dashboard. Its signature **Evidence Rail / 访问证据轨** places access decisions next to the ticketed request. The hero states “证据够用，内容不越界”; roles and provider are always visible; session revocation is a first-class action. Exact-ID/ticket/reason fields precede the rail, and the aggregate custody summary appears only after an audited success.

Wide layout keeps request and proof in adjacent columns, then spans the evidence summary. Mobile preserves `建立查询依据 → 访问证据轨 → 账户证据摘要`. The Mineral/Juniper/Paper language connects to the user logbook while square edges, grid paper and monospaced receipts distinguish the operator surface. Focus styles, reduced motion, 44px controls, semantic radio groups and no-horizontal-overflow behavior are included.

Reviewed evidence:

- [1440 × 1100 administrator desk](../../output/playwright/iteration-014-admin-wide.png)
- [390 × 844 administrator desk](../../output/playwright/iteration-014-admin-mobile.png)

## 4. Validation evidence

- `pnpm test`: 30 files / 91 tests passed.
- `pnpm test:integration`: 10 files / 36 tests passed; administrator suite is 5/5.
- Administrator integration explicitly proves token separation, production-disabled dev issuer/audit, least privilege, bounded exact lookup, HMAC target, not-found evidence, immutable-row rejection, audit pagination, verified OIDC, replay/wrong-audience/wrong-nonce/unknown-subject rejection and session revocation.
- `pnpm test:ai`: 7/7 passed. `pnpm eval:ai`: 7/7 and `pnpm eval:food-photo`: 8/8 passed with fixture providers and no paid model call.
- Full workspace typecheck passed.
- API, admin, H5 and WeApp production builds passed. Admin routes were compiled by Next 16.2.10; H5 retained its 305 KiB entry warning and WeApp retained its 417 KiB vendor warning.
- `pnpm test:e2e`: 21/21 Chromium flows passed, including both administrator layouts, CSP header, HttpOnly/SameSite cookie, exact query, exclusion checks, audit rail and session revoke.
- `pnpm audit:prod`: 0 critical, 0 high, 6 moderate, 0 low. The six registered Taro toolchain findings remain; the new PostCSS advisory was removed with a parent-qualified floor.
- `pnpm peers check`, `pnpm install --frozen-lockfile`, migration verification for all 12 migrations and generated OpenAPI passed.
- Local PostgreSQL 18.4, Redis 8.8 and fixture AI report healthy. Cleanup verified zero users, zero auth/admin sessions/identities/audit events, zero product records/erasure receipts, Redis DB size zero and no private upload files.

## 5. Problems found and experience captured

- A cursor helper accepted a narrow TypeScript type but runtime-serialized the full event object, exceeding the 256-character contract. Explicit projection before serialization is required; type annotations do not remove runtime fields.
- OIDC signature/audience checks are incomplete without a browser-bound nonce. The nonce was added to the shared contract, BFF transient cookie and API verification, then exercised with a wrong-nonce test.
- OIDC issuer identifiers are exact strings, not generic URLs to canonicalize. A shared URL parser would remove a legal trailing slash, so validation now preserves configured bytes; the integration issuer deliberately ends in `/operator-tenant/` to prevent regression.
- A production-disabled development route is still an access decision. Returning `404` without audit would leave a blind spot, so the API records `operator.session.denied` before hiding the route.
- Playwright's request base URL follows URL resolution rules: a base ending in `/v1` plus `/auth` resolves outside the prefix. The test now uses `/v1/` and a relative path, and keeps the response body in assertion diagnostics.
- Next standalone output in this Windows/pnpm environment hit an `EPERM` while resolving symlinks. Browser validation therefore uses Next's production preview on Windows; the deployment command retains standalone output for a later Linux container proof. A successful preview is not evidence that shared production deployment exists.
- Next regenerates `next-env.d.ts` with its own formatting during every build. Treating that generated boundary as hand-formatted source made the format gate order-dependent, so it is now explicitly ignored by Prettier while remaining committed for TypeScript discovery.
- Installing the new app exposed a new moderate PostCSS path despite using the latest Next release. Auditing after each workspace addition and scoping a patched parent override removed it without changing the older Taro graph.
- The Taro dependency reinstall invalidated Webpack's serialized cache and created extreme restore-warning output. Renaming/removing only the verified client cache and rebuilding from clean state restored a normal successful build; source and artifacts were untouched.
- Visual evidence matters for an admin page too: the long mobile audit rail remained readable and correctly preceded the summary, while the wide screen avoided the temptation to fill empty space with user content or charts.

## 6. Remaining risks and next step

R-016 remains high: no enterprise OIDC tenant/client, access approver, periodic recertification or named operator exists. R-017 remains high: the primary table is append-only, but independent retention/export, restore proof and audit alerts are absent. No administrator surface has been deployed, and the Linux standalone path is unproven in a release container.

Existing release blockers remain: production user identity, six moderate Taro toolchain advisories, private object storage, durable reconciliation, backups/provider deletion, centralized metrics/alerts, approved AI provider/canary, licensed food catalog, accessibility/performance hardening, legal/filing review and shared deployment.

Iteration 015 will implement durable data operations: encrypted private object storage boundary, expiry/reconciliation jobs, backup/restore evidence and provider-deletion tracking. It must preserve user ownership and the newly independent administrator boundary rather than adding broad mutation powers.

## 7. References

- [Administrator support model](../architecture/ADMIN_SUPPORT_MODEL.md)
- [ADR-0014](../architecture/decisions/0014-independent-operator-trust-boundary.md)
- [Administrator access runbook](../operations/ADMIN_ACCESS_RUNBOOK.md)
- [Next.js installation and production build documentation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js 16.2.10 release](https://github.com/vercel/next.js/releases/tag/v16.2.10)
