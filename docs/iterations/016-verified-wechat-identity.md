# Iteration 016 — Verified WeChat user identity

Date: 2026-07-19

State: complete locally for server-verified WeChat code exchange, provider-bound sessions and erased-identity suppression; real Mini Program credentials/domain/device proof, shared deployment and H5 release identity remain open

## 1. Scope and success standard

Replace the production client’s unusable dependency on the local development issuer with one narrow release-path adapter: WeChat Mini Program `Taro.login` code → server `code2Session` verification → provider-neutral opaque session. Carry permanent account erasure through that new identity boundary so an automatically verified provider identity cannot silently recreate a deleted account, including after an old database backup is restored.

This round does not create a cloud account, register a Mini Program, obtain AppID/AppSecret, configure a request-domain allow-list, deploy managed PostgreSQL/Redis/object storage, create DNS/TLS/WAF, select an H5 identity provider, add account linking/recovery, permit re-registration after deletion, or claim a shared/public deployment. Those require external credentials/ownership and remain explicit gates.

Acceptance required a strict client/server contract; no client-provided `openid`; no persisted `session_key`; explicit provider on sessions; production configuration that forbids `dev`; a WeApp-only HTTPS build mode; duplicate-safe identity issuance; immediate rejection for inactive/deleted identities; v2 erasure and legacy-v1 restore compatibility; full lifecycle integration proof; updated OpenAPI/runbooks/status/risk/ADR; full regression; one archive and one commit.

Rollback point: migration 0015 is additive and remains applied. Identity issuance can be held while the application rolls forward/back, but a compatible erasure worker/reconciler must remain. Suppressions and `deletion_pending` accounts must never be removed/reactivated as rollback shortcuts.

## 2. Structure and technology state

New and changed boundaries:

- `packages/contracts/src/auth.ts`: provider enum, strict WeChat code request and verified-session response (`provider`, `isNewUser`).
- `apps/api/src/auth/auth.service.ts`: official code exchange, provider-subject issuance, advisory-lock deduplication, suppression check and provider-aware authentication.
- `apps/api/src/auth/auth.controller.ts`: documented/rate-limited `POST /v1/auth/wechat/session`.
- `apps/api/src/config.ts`: adapter allow-list, WeChat credential validation, production ban on `dev` and production endpoint pinning.
- `infra/postgres/migrations/0015_verified_user_identity.sql`: explicit session provider and unlinkable `auth_identity_suppressions`.
- `apps/client/config/index.ts` and `apps/client/src/lib/api.ts`: build-time `dev|wechat` mode, WeApp/HTTPS guard, `Taro.login`, common token storage and first-user onboarding behavior.
- `apps/api/src/privacy/erasure-ledger.service.ts` and `data-operations.service.ts`: v2 identity HMACs, transactional suppression and v1/v2 restore reconciliation.
- `apps/api/src/scripts/verify-backup-restore.ts`: migration-15 proof that restore replay deletes the user and creates the missing suppression before traffic.
- `docs/operations/USER_IDENTITY_RUNBOOK.md`, ADR-0016, identity/data-custody models, risk/roadmap/status and generated OpenAPI: operational and architectural record.

Technology delta is intentionally small: Node’s built-in `fetch`, `URL`, `AbortSignal.timeout` and `crypto` are used; no identity SDK or token dependency was added. Taro 4.2.1 supplies the Mini Program login code. NestJS 11, Zod 4, PostgreSQL 18.4, Redis rate limits and existing opaque sessions remain the execution boundary.

## 3. Design and implementation methods

### WeChat trust termination

The client calls `Taro.login({timeout: 8000})` only in a WeApp build and posts `{code}`. The strict request rejects extra identity fields. The API constructs the server-only exchange using AppID/AppSecret, an eight-second timeout and the official production endpoint. Provider error codes become a generic `401`; transport/non-JSON/malformed identity results become `503`. No provider response is logged.

The stable subject is `<AppID>:<openid>` so two Mini Programs cannot collide even if provider identifiers share a value. The service locks `user-auth:<provider>:<subject>` with a PostgreSQL transaction advisory lock, checks erasure suppression, resolves or creates one identity/user, and inserts a provider-bound opaque session. The client receives `isNewUser`; an existing user without onboarding still gets the same 404-to-onboarding behavior. A `401` clears only the application token and obtains a fresh provider code.

Production configuration is fail-closed: `AUTH_ENABLED_PROVIDERS` cannot contain `dev`, WeChat credentials are required when enabled, and the exchange URL cannot be changed from the official HTTPS address. Integration tests may point to a loopback HTTP provider double. Verified issuance has a separate 30/minute/IP policy beneath the 1200/minute ingress gate.

### Client release boundary

`TARO_APP_AUTH_MODE=wechat` is rejected unless `TARO_ENV=weapp`, and its API base must be HTTPS. The normal local H5/E2E build continues to use `dev`; this is development compatibility, not an H5 release claim. The common token key is no longer labeled as development-only. Re-authentication and account deletion remove the unused legacy token; deletion also clears the common token and local-only subject.

Interaction design stays deliberately invisible for the happy path: launching the Mini Program obtains a platform code, a new user enters the existing onboarding flow, and a returning user loads the existing profile. There is no client identity selector or caller-editable account identifier. Invalid/expired/provider-unavailable responses use the existing bounded error state. An erased identity currently receives a clear API error rather than being routed into onboarding; a dedicated “create a completely new account” decision screen is deferred with R-021, because adding the screen before policy approval would imply an unsupported recovery path.

### Erased-identity suppression

User-ID HMAC deletion ledgers prevent backup resurrection but do not stop a provider identity from creating a new user. New ledger objects therefore use `durable-erasure-ledger-v2` and add bounded `{provider, subjectRef}` entries, where:

```text
subjectRef = HMAC-SHA256(ERASURE_LEDGER_HASH_SECRET,
                         "identity\0" + provider + "\0" + providerSubject)
```

The raw provider subject never enters the ledger or suppression table. Account erasure collects identities before cascading the user, publishes the external ledger, removes media, then inserts suppressions and deletes the user inside the final leased-job transaction. Login checks the same HMAC after taking the same provider-subject advisory lock, so deletion and new issuance cannot race.

Restore replay reads both ledger versions. V2 references directly upsert suppressions. For a v1 user reference, the isolated restored database still contains the associated identities; replay derives their HMACs before deleting the user. Traffic may open only after both deletion and suppression reconciliation succeed.

The MVP returns `403` for an erased identity and offers no support override. That prevents silent recreation but is not yet an approved “never return” product policy. R-021 requires a deliberate fresh-account consent flow, if product/legal review permits return, that must not reconnect erased content.

## 4. Validation evidence

- `pnpm db:migrate`: 15 checksum-protected migrations applied/verified.
- Contracts/config/schema/OpenAPI and model units: final `pnpm test` — 32 files / 100 tests passed.
- PostgreSQL/provider/object lifecycle: `pnpm test:integration` — 11 files / 42 tests passed. The new tests reject client `openid`, map invalid provider code to `401`, prove first/repeat session identity, persist provider/token hash without provider secret, complete erasure, create one suppression and return `403` on the same verified identity.
- Real restore proof:

```json
{
  "proofVersion": "backup-restore-erasure-v2",
  "backupBytes": 111235,
  "restoredMigrationCount": 15,
  "restoredUserBeforeLedger": 1,
  "restoredSuppressionsBeforeLedger": 0,
  "ledgerEntries": 1,
  "restoredIdentitySuppressions": 1,
  "erasedRestoredUsers": 1,
  "restoredUserAfterLedger": 0,
  "restoredSuppressionsAfterLedger": 1,
  "receiptStatus": "completed",
  "backupDisposition": "ledger_published"
}
```

- Full workspace typecheck and build passed. The default H5, API and administrator builds passed; a separate `TARO_APP_AUTH_MODE=wechat` + HTTPS `build:weapp` passed. Existing non-blocking size/cache warnings remain registered.
- AI worker: 7/7; weekly-plan eval: 7/7; food-photo eval: 8/8. Fixtures were used and no paid model call was made.
- Playwright Chromium: 21/21 existing end-to-end product/admin/privacy flows passed with the common token key and local adapter.
- `pnpm audit:prod`: 0 critical, 0 high, 6 moderate. The registered Taro build-chain findings remain.
- Local PostgreSQL, Redis, MinIO and fixture AI were healthy. Final scoped cleanup verified no test users, sessions, jobs, receipts, suppressions, private objects or restore databases remained.

## 5. Problems found and experience captured

- A production build can compile while still being unusable. The earlier client always called a route that production intentionally hid; release review must exercise the actual identity mode, not infer readiness from compilation.
- Provider identity must terminate server-side. A strict object that accepts only `code` is simpler and safer than accepting an `openid` and trying to “validate” it later.
- AppID is part of the stable namespace. Persisting a bare `openid` would bake in an unsafe cross-application assumption.
- Provider session material and application session material have different purposes. `session_key` is unnecessary for current features; minimizing it to memory-only exchange avoids a new secret lifecycle.
- User-ID tombstones solve restore resurrection, not automatic account recreation. Identity suppression has to be part of the erasure invariant and the restore invariant.
- Backward-compatible ledger parsing is not enough. V1 replay must derive suppressions from isolated restored identities before deleting them, otherwise old controls preserve only half of the new guarantee.
- HTTP semantics and job completion are separate: deletion always returns `202 Accepted` even when the immediate worker completes before the response. Tests should assert both transport contract and body lifecycle.
- A failed first lifecycle-test assertion left one exact local ledger object/receipt/suppression. It was inspected and removed by its exact receipt UUID before rerun; cleanup now captures the receipt from successful `202` responses and removes all three domains.
- Full integration tests took longer when several validation launches overlapped. Polling the original process to completion showed 42/42 pass; future CI should serialize this shared-database suite and expose an explicit timeout/result artifact.
- Permanent suppression is a product policy, not only a security mechanism. Blocking silent recreation is correct; blocking every future explicit new account requires separate approval and UX.

## 6. Global state review, remaining risks and next step

Product loop remains complete locally through records, trends, deterministic/AI-assisted plans, photo proposals, privacy ownership, operator evidence and durable data operations. The Mini Program now has a production-shaped identity implementation, but there is still no deployed environment or real provider proof. H5 remains development-only for identity. Native/device sync remains deferred.

Release risks carried forward: real WeChat AppID/secret/request-domain/device verification; managed database/Redis/object storage/KMS/IAM/backups; independently retained ledger and HMAC recovery/rotation; centralized telemetry/alerts and named owners; calibrated proxy/rate limits; H5 identity; explicit re-registration policy; account linking/recovery; provider/legal/filing review; real AI canary/catalog licensing; bundle budgets; six moderate toolchain advisories; and unavailable GitHub transport.

Iteration 017 is the shared test deployment slice. It should provision managed services and secrets, configure real WeChat identity/domain, run migration/readiness/product/erasure/restore smoke tests, centralize metrics/alerts, calibrate proxy/rate behavior, and exercise deploy/rollback. If the required cloud, DNS and Mini Program credentials are not yet supplied, the round must produce a credential/ownership checklist and cannot claim deployment.

## 7. References

- [User identity runbook](../operations/USER_IDENTITY_RUNBOOK.md)
- [Data custody runbook](../operations/DATA_CUSTODY_RUNBOOK.md)
- [ADR-0016](../architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
- [Taro login API](https://docs.taro.zone/en/docs/apis/open-api/login/)
- [WeChat Mini Program login](https://developers.weixin.qq.com/miniprogram/en/dev/framework/open-ability/login.html)
