# Iteration 029 — H5 OIDC browser transaction and candidate artifact

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing exact-SHA hosted CI is post-commit evidence, while a real OIDC tenant, hosted callback, managed deployment and public delivery remain gated

## 1. Scope and success standard

Iteration 028 made the API an OIDC trust terminator but deliberately left H5 on `dev / preview-only`. This round closes that locally implementable gap with one bounded scope: the browser Authorization Code + PKCE transaction, its explicit login/error surface, and a deterministic `oidc / candidate` H5 artifact contract.

Success requires cryptographic state/nonce/verifier generation and S256; tab-scoped, versioned, expiring transaction state; an exact same-origin callback bridge compatible with Taro hash routing; immediate URL cleanup; strict one-time state/issuer/parameter/callback validation; no code persistence or automatic exchange replay; accessible mobile/wide UI and product-owned errors; release-mode HTTPS/OIDC enforcement; callback files inside the canonical TAR but outside WeApp; independent standard/OIDC browser suites; updated admission, architecture, operations, design, roadmap, risks and one iteration archive.

This round does not select or provision a real IdP, create a client secret, prove a hosted domain or callback rewrite policy, change CORS/DNS/TLS, link WeChat and OIDC accounts, publish a new tag/TAR, provision managed infrastructure, open traffic or claim legal/production approval. `candidate` remains a controlled-delivery classification rather than a public-readiness claim.

## 2. Structure, technology and design state

Changed boundaries:

- `apps/client/src/pages/login/` adds the H5 login page, a pure OIDC transaction model and focused tests.
- `apps/client/src/static/auth/callback/` adds a CSP-restricted, no-referrer callback bridge with an external fixed script.
- `apps/client/src/lib/api.ts` routes missing OIDC sessions to login, reads the browser-safe config, validates the returned session contract and stores only the product token.
- Taro configuration now admits `oidc` only for H5, requires it plus HTTPS for release H5, copies callback files only to OIDC H5 and emits `candidate` metadata.
- `scripts/client-release.mjs` requires the callback HTML/script inside canonical H5 TARs; deployment admission expects both API identity providers and controlled H5/WeApp candidate preview.
- CI builds and runs the regular H5 suite first, then a separate OIDC build and suite. The default Playwright config explicitly ignores the OIDC-only file so authentication modes cannot borrow the wrong artifact.
- the publish workflow builds H5 with OIDC; the Windows-safe helper executes pnpm through `cmd.exe`, while Linux calls pnpm directly.

Technology remains Taro 4.2.1, React 18, strict TypeScript, Zod contracts, NestJS 11, PostgreSQL 18, Redis, private S3-compatible storage, FastAPI and Playwright 1.61.1. The browser cryptography boundary uses `crypto.getRandomValues`, `SubtleCrypto.digest('SHA-256')`, base64url encoding and a pure injectable model for deterministic tests.

The visual direction reuses 衡迹 Paper/Mist, Mineral and Juniper tokens rather than adding a new palette or font. Its signature is a short three-step **Login Trace / 登录轨迹**: local transaction, provider confirmation and product-session return. Mobile keeps one primary action and the trace before the boundary note; wide H5 turns the note into a mineral evidence rail. Status uses `role=status`/`aria-live`, focus is visible, reduced motion removes the progress animation, and provider prose is never rendered.

Reviewed evidence:

- [390 × 844 login-ready capture](../../output/playwright/iteration-029-oidc-login-mobile.png)
- [390 × 844 provider-denial capture](../../output/playwright/iteration-029-oidc-denied-mobile.png)
- [1440 × 1000 login-boundary capture](../../output/playwright/iteration-029-oidc-login-wide.png)

## 3. Implementation method

### Bind one browser tab

Each start creates 32 random bytes for state, 32 for nonce and 64 for the verifier, producing 43/43/86-character base64url values. The model hashes the verifier into an S256 challenge, stores only a strict transaction record in `sessionStorage`, and constructs the authorization URL from server-published values. The record lives for ten minutes with a one-minute future-clock tolerance.

The exact `/auth/callback` page has `default-src 'none'; script-src 'self'`, no referrer and no inline script. It records only the actual callback origin/path, strips the query at that path, then replaces navigation with `/#/pages/login/index?<response>`. The login page strips that response from history before its config request, requires the stored callback marker or recognized response, and compares the returned values with the initiating transaction.

Known parameters must be single-valued; unknown parameters, wrong state, changed issuer/callback, missing transaction, missing result and expiry fail closed. Even an unknown-only callback consumes and removes the transaction. Consumption occurs before code exchange, so a network or provider error cannot cause an automatic replay. The authorization code never enters Web Storage.

### Keep identity and error ownership narrow

The H5 API client accepts only strict shared config/session schemas and requires the issued provider to be `oidc`. Successful new users route to onboarding; returning users route to Today. Any protected request without a stored token re-launches login in an OIDC build.

Provider cancellation and failure map to product copy. `error_description` is bounded for parsing but never displayed; codes, state and upstream payloads do not enter logs or UI. Retry means creating a fresh state/nonce/verifier and provider authorization, not resending a consumed code.

### Make the artifact tell the truth

A release H5 build must be `oidc`, use HTTPS, and emit `deliveryClass: candidate`. Canonical packaging fails if either callback file, the application entrypoint or embedded metadata is missing. WeApp remains `wechat / candidate`; the Taro copy rule ensures H5 callback files never enter its output. Deployment admission now plans exact H5 and WeApp private-preview uploads followed by real browser/device identity and custody evidence before delivery.

## 4. Validation evidence

- Focused OIDC model/release/admission validation passed 3 files / 26 tests. It covers high-entropy values, exact S256 derivation, one-time consumption, wrong state/issuer/callback, duplicate/expired/unknown-only results, provider-denial copy, required TAR files and candidate admission order.
- Full Vitest passed 39 files / 162 tests. Strict TypeScript passed all six product/shared workspaces. Repository formatting passed.
- Python worker tests passed 7/7; AI-plan evaluation passed 12/12; food-photo evaluation passed 11/11; formatted evaluation artifacts had zero Git diff.
- Production dependency audit reported zero critical/high and retained the registered six moderate Taro build-chain findings.
- Full workspace, H5 and WeApp builds passed. H5 retained its 305 KiB entry and a largest warned chunk of about 604 KiB; WeApp retained its 417 KiB vendor warning. The known Taro webpack/cache warnings remain non-blocking. Direct output assertions proved both WeApp and development-auth H5 contain no `auth/callback` directory, while OIDC H5 contains both required files.
- PostgreSQL applied/verified all 19 migrations. Integration passed 11 files / 47 tests. The real backup/restore/ledger replay drill restored 19/19 migrations, recreated one identity suppression and removed the restored erased user.
- The standard development-auth H5 build passed 22/22 Playwright scenarios. A fresh OIDC H5 build then passed 3/3 browser scenarios: state/nonce/S256 binding and exactly one exchange, denial cleanup without provider-text rendering, and default-route protection plus wide layout. The three captures above were visually reviewed at original resolution with no hierarchy or overflow issue.
- A release-shaped H5 build emitted `myfitness-client-build/v1` with `oidc / candidate`. Canonical packaging accepted 28 files, 4,928,000 bytes and both callback assets; the structural validation artifact used the already-green baseline revision `d5b4adc1...`, was never published, and was deleted after inspection.
- The complete disposable deployment smoke built API/Admin/AI images, applied the migration gate, reached PostgreSQL/Redis/object-storage/API/Admin/AI health, verified correlation and administrator security headers, and removed its containers, network and volumes. Registry `ECONNRESET` events were retried successfully by pnpm and did not weaken the gate.
- The last baseline hosted proof before this commit is GitHub CI #18 for exact SHA `d5b4adc1...`, with successful `quality` and `deployment-smoke`. The implementing iteration-029 hosted run can exist only after this archive is committed and pushed; it must be checked by exact SHA and is not predicted here.

## 5. Problems found and experience captured

- Taro's general static directory did not copy the callback bridge into the actual H5 root. An explicit H5-only copy rule plus required TAR entries made the runtime dependency testable and kept it out of WeApp.
- A callback with only unknown parameters initially looked like a normal login route. The callback-target marker is now part of detection, and every callback-originated result consumes/clears the transaction before failing.
- Directly spawning `pnpm.cmd` with Node 24 on Windows returned `EINVAL`. The helper now uses `cmd.exe /d /s /c` only on Windows and direct pnpm elsewhere, and the same public script is exercised locally and in Linux CI.
- Putting the OIDC spec in the common E2E directory caused the regular `dev` build to collect 25 tests and fail the three identity-specific cases. Explicit default-suite exclusion preserves two honest build matrices: 22 regular cases and 3 OIDC cases.
- A static callback is part of authentication code, not incidental hosting content. It needs CSP/referrer policy, exact path behavior, release-manifest inclusion and shared-host verification like any other security boundary.
- URL cleanup must happen before configuration/network work. Cleanup only after successful exchange would leave a code visible during provider/API delay or configuration failure.
- One-time exchange is intentionally not automatically retried. A user-visible fresh start is safer than guessing whether a code reached the server.
- Browser/provider doubles prove protocol implementation and UI behavior, but they cannot prove tenant policy, provider recovery, DNS/TLS/CORS, static-host slash canonicalization or real data custody.

## 6. Global state review, remaining risks and next step

Both first-release client artifacts now have production-shaped candidate contracts: WeApp uses WeChat and H5 uses OIDC with a browser transaction that is locally unit- and browser-proven. The application still is not online. There is no owner-approved account/budget, canonical API/H5 origin, end-user or operator OIDC tenant/client, WeChat credential, managed PostgreSQL/Redis/object storage/KMS, independent ledger custody, central telemetry/alerts, real provider/device/browser evidence, AI canary approval or protected deployment dossier.

R-002 remains High but is narrowed from a missing H5 browser implementation to missing real-provider/domain evidence. R-027 remains High for OIDC tenant, recovery, linking and provider data policy. R-009 records the 305 KiB entry/about 604 KiB largest H5 chunk and 417 KiB WeApp vendor warning. Six moderate production dependency advisories remain registered; critical/high findings are zero.

Iteration 030 returns to the real requested outcome: obtain the owner-approved managed-environment inputs, configure the canonical client API URL, publish and independently verify a new exact-source service/client candidate, create the protected dossier, provision and deploy with no general traffic, then exercise real WeChat/OIDC identity, callback hosting, custody, telemetry, provider canary and rollback before any bounded cohort. Iteration 031 remains the post-retention native/device feasibility gate.

## 7. References

- [Iteration 028 archive](028-h5-oidc-server-boundary.md)
- [ADR-0027: H5 OIDC API boundary](../architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
- [ADR-0028: H5 OIDC browser transaction and candidate](../architecture/decisions/0028-h5-oidc-browser-transaction-and-candidate.md)
- [Identity/profile model](../architecture/IDENTITY_PROFILE_MODEL.md)
- [User identity runbook](../operations/USER_IDENTITY_RUNBOOK.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
