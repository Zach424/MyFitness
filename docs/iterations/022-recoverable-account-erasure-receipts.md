# Iteration 022 — Recoverable account-erasure receipts

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while managed shared deployment remains intentionally gated on owner-controlled infrastructure and credentials

## 1. Scope and success standard

MyFitness remains a privacy-first WeChat Mini Program and responsive H5 fitness record, planning and review product. Iteration 021 made client delivery bytes immutable, but the planned managed deployment cannot start honestly without an owner-approved account, region, budget, domain, client API URL and protected WeChat/OIDC references. The risk register also contained a release-critical erasure flaw: if `DELETE /me/privacy/account` committed and its response disappeared, access was correctly closed but the one-time receipt credential disappeared with it.

This round pulls that independent privacy risk forward and implements one bounded recovery protocol. Acceptance requires a 15-minute single-use deletion intent; a server-generated 256-bit base64url secret whose SHA-256 hash is the only server-side copy; client persistence before deletion; atomic intent consumption; reuse of the same credential for minimal receipt recovery after authentication is closed; rotation/expiry/random-secret rejection; rate limits and `no-store`; a masked rather than full-secret UI; real-browser proof for a committed delete whose response is aborted and whose page is then reloaded; restore-ledger compatibility; documentation, ADR and exactly one Conventional Commit.

It does not provision cloud resources, invent an account/domain/provider choice, publish a new candidate, configure WeChat/OIDC, open traffic, change AI or health advice, change erasure retention promises or add administrator access. Managed shared test deployment is explicitly renumbered to iteration 023 rather than being misreported as complete.

## 2. Structure, technology and design state

New and changed boundaries:

- `infra/postgres/migrations/0016_recoverable_erasure_receipts.sql`: one active intent per user, unique lowercase SHA-256 hash, strict expiry and a cleanup index.
- `packages/contracts/src/privacy.ts`: strict deletion-intent, deletion request and receipt-token contracts shared by client and API.
- `apps/api/src/privacy/privacy.controller.ts` and `privacy.service.ts`: authenticated intent creation, atomic consume-and-delete orchestration and hash-only secret handling.
- `apps/api/src/privacy/erasure-receipts.controller.ts`: unauthenticated bearer-secret recovery returning only `durable-erasure-v2` receipt status.
- `apps/api/src/operations/rate-limit.policies.ts` and `apps/api/src/bootstrap.ts`: user/IP limits and explicit CORS permission for `X-Erasure-Intent-Token`.
- `apps/client/src/lib/api.ts`: strict local receipt state, pre-delete persistence, no automatic re-authentication after destructive `401`, response-loss recovery and reload recovery.
- `apps/client/src/pages/privacy/*`: recovery-first startup, masked receipt secret, calm local-custody explanation and explicit local removal.
- `tests/e2e/privacy.spec.ts`, API integration tests and contract/model tests: normal, rotation, expiry, invalid secret, response-loss and reload cases.
- Committed OpenAPI 3.0, privacy ownership model, data-custody runbook, ADR-0015 extension, ADR-0022, project status, roadmap and risk register describe the new protocol and remaining client-storage risk.

The product still uses Taro 4 + React + strict TypeScript, NestJS 11, Zod 4, PostgreSQL 18, Redis and private S3-compatible storage. The privacy screen keeps the established paper/juniper/navy “data-custody receipt” design rather than introducing a generic confirmation page. The new state adds one centered tear-off receipt, visible completion hierarchy, a masked key, a plain-language local recovery note and a single explicit removal action. The reviewed mobile evidence is `output/playwright/iteration-022-erasure-recovery-mobile.png`, bringing the visual evidence set to 23 screenshots.

## 3. Implementation method

### Prepare the recovery credential before the destructive commit

`POST /v1/me/privacy/account-deletion-intents` locks one active user, generates a UUID and 32 random bytes encoded as 43 base64url characters, hashes the secret with SHA-256 and upserts a 15-minute intent. The unique user constraint makes creation a rotation operation; an older secret no longer matches. The response is private/no-store and the user-scoped rate limit allows six intent creations per hour.

The client validates and persists `{ intentId, statusToken, expiresAt }` before calling `DELETE`. The strict delete body now includes `intentId`, while the secret travels only in `X-Erasure-Intent-Token`. Inside the existing deletion transaction, the service deletes exactly one matching, unexpired intent by ID, user and hash before marking the user `deletion_pending` and creating the durable receipt/job. An invalid, expired, rotated or consumed intent fails before account state changes.

### One secret bridges the closed-session boundary

The consumed intent secret becomes the receipt token; no new credential depends on delivery of the destructive response. The normal receipt-ID route still requires UUID plus secret. The new `POST /v1/privacy/erasure-receipts/recover` hashes the same header, finds one strict `durable-erasure-v2` receipt and returns the minimal status only. It is IP-rate-limited, private/no-store and does not expose user identity, health data or the bearer secret.

The client deliberately disables its ordinary `401` re-login behavior for account deletion. If the delete transport fails, it immediately attempts token recovery; on page startup it checks the strict locally persisted state before trying authenticated overview loading. A completed recovery clears local authentication. An unconsumed unexpired intent is treated as “delete did not commit”; an expired unused intent is removed. A known receipt whose recovery is temporarily unavailable is preserved and surfaced as an error rather than silently creating a different identity.

### Preserve the erasure and visual boundaries

Receipt completion still clears the direct user/subject references, and restore-ledger replay/identity suppression are unchanged. The client never renders the full secret: the formatter keeps four leading and six trailing characters only. The explicit “remove from this device” action controls the local bearer copy. This solves ambiguous completion; it does not claim secure enclave storage or shared-device isolation, which remains R-025.

## 4. Validation evidence

- Strict contract/API/client type checks passed. Targeted OpenAPI, contract and privacy-model tests passed 10/10; the model separately proves the rendered receipt cannot contain the full secret.
- All 16 checksum-protected migrations applied. Privacy and authentication integration passed 2 files / 7 tests, covering normal deletion, object-store retry, receipt recovery, random credentials, intent rotation/expiry and erased WeChat-identity suppression.
- The complete unit gate passed 35 files / 134 tests. AI worker tests passed 7/7, plan-explanation evaluation 7/7 and food-photo evaluation 8/8 using fixtures; no paid model call occurred.
- The complete integration gate passed 11 files / 43 tests. `backup-restore-erasure-v2` restored migration 16, replayed one ledger entry, recreated one provider-identity suppression, erased the restored deleted user and ended with zero restored users, a completed receipt and `ledger_published` disposition.
- H5 and WeApp production builds, the API, administrator and complete workspace build passed. Registered H5 305 KiB entry/large-chunk, WeApp 417 KiB vendor and non-blocking Taro cache warnings did not materially change.
- Production dependency audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain advisories.
- Playwright passed 22/22 administrator, nutrition/photo, onboarding, plan/AI, privacy, body, Today, workout and erasure-recovery flows. The new test lets the real API commit deletion, aborts the browser response, observes automatic token recovery, reloads and recovers the same receipt again. The new mobile screenshot was inspected at original resolution; generated changes to the 18 prior screenshots and evaluation report were restored to reviewed `HEAD` bytes.
- The real `pg_dump → pg_restore → ledger replay` drill passed after its expected migration count advanced from 15 to 16.
- The complete three-image deployment smoke passed despite transient registry retry warnings: pinned AI/API/administrator images built, migration completed before traffic, all dependencies and application images became healthy, and the black-box verifier returned all four checks. Smoke containers/network/volumes and local dependency containers were removed.
- Final formatting, whitespace, OpenAPI freshness, secret scan and staged-file review run after documentation closure. Remote main CI is post-commit evidence rather than predicted here.

## 5. Problems found and experience captured

- A destructive response cannot be the first and only delivery of its recovery credential. The secret must exist on the client before the commit that closes authentication.
- Idempotency and recovery are different concerns. A single-use intent prevents duplicate authorization; token lookup resolves whether an ambiguous destructive request actually committed.
- Generic authentication retry is unsafe on an account-erasure call. Re-authentication after a deletion `401` can contradict access closure or create a different local identity.
- Custom privacy headers must be exercised through a real browser. Unit and direct API tests passed while the first browser attempt failed because CORS had not allowed `X-Erasure-Intent-Token`; adding the header to the actual application bootstrap and testing preflight closed that gap.
- Operational assertions are versioned product code. The restore drill successfully proved erasure but initially failed because its migration-count expectation still said 15; schema changes must advance drill expectations in the same round.
- A secret can remain usable without being visually exposed. Masking plus explicit local removal preserves the receipt metaphor and makes custody legible without treating a bearer token as a user-facing identifier.
- External deployment inputs are a real boundary, not a reason to fabricate completion. Reordering a bounded, already-registered privacy risk kept progress on the release critical path while preserving the managed-deployment gate.

## 6. Global state review, remaining risks and next step

The record, plan, AI, photo, administrator, release-manifest, client-artifact and managed-admission boundaries remain intact. Account deletion now has recoverable ambiguous-commit semantics, and R-018 is resolved with reproducible API/browser/restore evidence. The new R-025 records that a bearer receipt secret remains in application storage until removal; platform-secure storage, shared-device behavior and final retention policy need closed-beta review.

Still open: approve/configure the client API address and publish a new candidate; provision managed PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; load real WeChat and OIDC secrets; exercise WeChat request-domain/device login and erasure; select H5 production identity; centralize telemetry/alerts; calibrate capacity/rates; approve an AI provider canary; and run migration, black-box, privacy, restore and rollback proof in the managed environment.

The next controlled step is iteration 023: use owner-provided account/region/budget/domain and protected references, configure the client API variable, publish/download/verify a new immutable service/client candidate, provision shared resources, run admission, deploy services without general traffic, upload the admitted WeApp TAR to private preview, and exercise identity, custody, telemetry, canary and no-traffic rollback. Iteration 024 owns H5 production identity and public-beta hardening.

## 7. References

- [ADR-0015](../architecture/decisions/0015-durable-data-erasure-and-restore-ledger.md)
- [ADR-0022](../architecture/decisions/0022-recoverable-account-erasure-receipts.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Data custody operations runbook](../operations/DATA_CUSTODY_RUNBOOK.md)
- [Iteration 021 archive](021-immutable-client-delivery-artifacts.md)
