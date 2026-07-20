# Iteration 028 — H5 OIDC server trust boundary

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing hosted CI is post-commit evidence, while browser callback, real identity provider and managed deployment remain gated

## 1. Scope and success standard

The release H5 artifact still uses the production-disabled development issuer. External managed-deployment inputs are not available, but the missing server-side H5 identity trust boundary is locally implementable and lies directly on that deployment path. This round therefore replaces the former iteration-028 deployment slot with one bounded prerequisite: a provider-neutral end-user OIDC Authorization Code + PKCE API adapter.

Success requires strict shared contracts; complete fail-closed production configuration; a browser-safe public config with no token/JWKS endpoint or secret; exact callback and RFC 7636 verifier validation; server-side code exchange; signed ID Token algorithm/JWKS/issuer/audience/age/expiry/nonce verification; stable minimized identity ownership through the existing opaque-session path; database and erased-identity provider constraints; generated OpenAPI; deterministic provider integration evidence; and updated architecture, operations, risk, roadmap and environment documentation.

This round does not implement H5 redirect/callback UI, state generation/validation, PKCE S256 generation, tab-scoped transaction storage or callback-history cleanup. It does not change the current `dev / preview-only` H5 release contract, select or provision an IdP, add a real secret, link WeChat/OIDC accounts, publish a tag/image/client TAR, create managed infrastructure or open traffic. Those distinctions prevent a server-complete adapter from being mistaken for a releasable browser identity flow.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts/src/auth.ts` adds `oidc`, a strict browser-safe authorization config and strict code/verifier/nonce/callback exchange input.
- `apps/api/src/config.ts` adds explicit OIDC enablement and complete issuer/authorization/token/JWKS/client/callback configuration. Production requires HTTPS, forbids URL credentials/query/fragment and keeps an optional client secret server-side.
- `apps/api/src/auth/auth.controller.ts` adds `GET /v1/auth/oidc/config` and `POST /v1/auth/oidc/session` under existing public-auth rate limits.
- `apps/api/src/auth/auth.service.ts` uses `jose` remote JWKS verification and the existing PostgreSQL advisory-lock/session/erasure-suppression path.
- migration 0019 broadens the `auth_identities`, `auth_sessions` and `auth_identity_suppressions` provider checks to include OIDC.
- the committed OpenAPI document and both environment templates expose the new non-secret/runtime contract.
- ADR-0027, identity architecture, operations, risk, roadmap, status and README record the trust boundary and remaining release gates.

Product technology remains Taro 4 + React + strict TypeScript, NestJS 11, Zod 4 contracts/OpenAPI, PostgreSQL 18, Redis, private S3-compatible storage and FastAPI. The H5 UI and bundles are unchanged, so the prior browser screenshots remain the visual authority; no new visual claim is made.

## 3. Implementation method

### Publish only the browser inputs

The config route returns exactly issuer, authorization endpoint, client ID, exact callback and `openid` scope. The token endpoint, JWKS URL and optional client secret stay in API runtime configuration. OIDC routes disappear with `404` when the provider is not enabled, and production continues to reject `dev`.

The exchange contract requires an authorization code, a 43–128 character unreserved PKCE verifier, a 43–128 character base64url transaction nonce and a URL callback. The service then compares the callback by exact string with the configured value before contacting the provider. This contract prepares, but does not pretend to implement, the next browser state machine.

### Verify before ownership

The API sends an `application/x-www-form-urlencoded` authorization-code request with the original verifier and callback. A confidential registration uses application-form encoded `client_secret_basic`; a public registration sends `client_id` in the form. Provider `400/401` becomes a generic invalid-code `401`, availability/malformed-response failures become generic `503`, and no upstream payload is logged.

The returned ID Token must verify through remote JWKS with RS256/PS256/ES256 only, exact issuer, client-ID audience, ten-minute maximum age, expiry and exact nonce. A multi-audience token additionally requires `azp` equal to the configured client ID. Only after those checks does the service derive `oidc:SHA-256(issuer || NUL || subject)` and enter the existing advisory-lock identity/session transaction. Raw subject, ID Token and upstream access token are not persisted.

Provider-neutral ownership and privacy controls remain unchanged: the browser receives a seven-day opaque `mf_user_*` credential; PostgreSQL stores only its SHA-256 hash; login checks the external-ledger-derived suppression under the same lock used for first-account creation. No email/profile-field linking is attempted, so the same person entering through WeChat and OIDC has separate accounts until a future explicit re-authentication design is approved.

### Standards applied

The design follows OpenID Connect Authorization Code flow, RFC 7636 S256-capable verifier rules, and RFC 9700 guidance for transaction-specific binding, authorization code rather than implicit issuance, HTTPS and exact redirect matching. ADR-0027 converts those protocol inputs into repository-owned invariants and lists rejected shortcuts.

## 4. Validation evidence

- Migration execution applied/verified all 19 migrations against the existing local PostgreSQL database, proving the named constraint replacement works after the prior schema.
- Focused production configuration passed 1 file / 9 tests, including complete OIDC acceptance plus missing token URL, production HTTP endpoint and short-secret rejection.
- Focused identity integration passed 1 file / 3 tests against a local HTTP provider that serves JWKS, signs RS256 ID Tokens and validates the token request. It proves public-config minimization, strict unknown-field/callback rejection, invalid code and nonce rejection, confidential Basic authentication, stable repeat-login ownership, provider-bound session issuance and absence of raw subject/upstream token in persisted evidence.
- Full Vitest passed 38 files / 157 tests. Full PostgreSQL/Redis/object-storage/provider integration passed 11 files / 47 tests.
- The real `pg_dump → pg_restore → ledger replay` drill passed with all 19 repository migrations, one restored user before replay, one recreated OIDC-capable provider suppression and zero restored users afterward. Its expected migration count now comes from the checksum-verifying migration runner instead of duplicating a schema version in the drill.
- Strict TypeScript passed all six product/shared workspaces; the API production build completed.
- OpenAPI generation completed through the real metadata-mode application graph and contains both OIDC routes plus the expanded provider enum.
- Repository formatting passed. Production preflight passed with a complete TLS OIDC-only runtime shape and reported only browser-independent aggregate settings. Production dependency audit retained the registered six moderate Taro build-chain findings and zero critical/high findings.
- The first full-integration attempt was invalid because Docker Desktop had exited: all 47 tests failed/skipped at dependency initialization. Docker Desktop and the four repository-local services were restarted and health-checked before the successful rerun. The initial direct production-preflight command likewise correctly rejected missing `NODE_ENV=production`; it was rerun with a complete non-secret production-shaped environment and passed. Neither failed invocation is counted as acceptance evidence.
- The first implementing hosted run, CI #17 for `70b2481`, failed at `ops:verify-backup-restore`: migration `0019` was present and successfully restored, but the drill still asserted the iteration-024 count of 18. Local reproduction returned the otherwise-correct proof with `restoredMigrationCount=19`; the follow-up derives the expectation from the migration runner. The replacement exact-SHA `quality` and `deployment-smoke` results remain post-commit evidence rather than a local prediction.

## 5. Problems found and experience captured

- A public H5 client cannot keep a secret; moving code exchange to the API protects the secret but does not remove the need for browser-generated PKCE, state and nonce.
- A signed ID Token is not sufficient alone. Issuer, audience, algorithm, age, expiry, nonce and multi-audience authorized party are separate account-ownership checks.
- Redirect URI equality belongs on both sides of the boundary. Accepting an arbitrary browser callback at the API would preserve an open redirect/code-delivery weakness even if the provider were configured correctly.
- Provider subjects are sensitive identifiers. Stable equality needs neither the raw value nor an operator-readable copy; hashing the unambiguous issuer/subject tuple reduces retained identity residue.
- Account linking is a separate high-risk feature, not an automatic consequence of adding a second provider. Email or display claims must not silently merge health-data accounts.
- JWKS retrieval errors and invalid identity claims need different operational classes: availability failures return `503`, while unverifiable identity returns `401`; neither exposes provider detail.
- Full integration evidence is meaningful only after proving dependencies are healthy. A suite that skips every test after setup failure cannot support any product claim, regardless of the number of reported failures.
- Production preflight is intentionally environment-sensitive. A development-shell rejection proves fail-closed behavior but must be followed by an explicit production-shaped success run.
- Migration-count assertions must not duplicate the schema version. CI #17 caught that the OIDC migration advanced the real restored schema while the privacy drill's literal remained stale; deriving the expectation from the same checksum-verified migration list keeps future schema rounds inside the restore gate without a second manual counter.

## 6. Global state review, remaining risks and next step

The API can now terminate both first-release identity families without accepting client-controlled subjects. H5 is still not a release candidate: no browser code creates or validates state/nonce/verifier, no callback removes authorization parameters from history, and the deterministic release manifest still requires `dev / preview-only`. Real provider tenant/client configuration, DNS/TLS/CORS, JWKS rotation, recovery policy and shared-browser evidence are absent. R-002 remains High with a narrower browser/shared-proof gate, and R-027 records the unapproved end-user OIDC tenant/recovery/linking/data-policy risk.

Managed infrastructure blockers are unchanged: approved public API/client origins; China-region account/entity/budget; protected WeChat/OIDC references; managed PostgreSQL/Redis/object storage/KMS; independent erasure-ledger custody; telemetry/alert owners; AI policy/provider canary authority; and protected approval evidence.

Iteration 029 owns the H5 browser half: cryptographically random state/nonce/verifier, S256 challenge, tab-scoped one-time transaction state, exact callback/issuer/error validation and URL cleanup, explicit accessible login/error UI, retry-safe exchange behavior, client tests/browser evidence, and a versioned deterministic `oidc / candidate` H5 release contract. Iteration 030 then returns to managed shared deployment and beta hardening; iteration 031 is the deferred native/device feasibility gate.

## 7. References

- [Iteration 027 archive](027-immutable-github-actions-supply-chain.md)
- [ADR-0016: verified WeChat identity](../architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
- [ADR-0027: H5 OIDC Authorization Code boundary](../architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
- [Identity/profile model](../architecture/IDENTITY_PROFILE_MODEL.md)
- [User identity runbook](../operations/USER_IDENTITY_RUNBOOK.md)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
