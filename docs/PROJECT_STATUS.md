# Project status

Last reviewed: 2026-07-19

Stage: first immutable candidate published and verified; managed-environment admission is locally green before external shared infrastructure

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                       | Current evidence                                                    | Next gate                                   |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Product scope           | Done for MVP baseline        | `docs/product/PRODUCT_BRIEF.md`                                     | Validate with target-user interviews        |
| Delivery roadmap        | Done for planning baseline   | `docs/product/ROADMAP.md`                                           | Package iteration 21 client artifacts       |
| Design language         | Partial, eleven flows tested | Core flows + 22 reviewed screenshots                                | Large text, keyboard and remaining states   |
| Client: Mini Program/H5 | Partial                      | WeChat-mode WeApp + development H5 build and product loop           | Real-device WeChat proof and H5 identity    |
| Admin console           | Partial, local slice done    | OIDC BFF, exact lookup, role split and Evidence Rail exercised      | Select IdP, owner, retention and deployment |
| Business API            | Partial                      | Verified identity plus non-root self-contained OCI runtime          | Shared deployment and real credential proof |
| Domain rules            | Partial                      | Safety validators + strict privacy action contracts                 | Add release policy enforcement              |
| AI service              | Partial                      | Text/vision fixture/OpenAI adapters + 15 eval cases                 | Approved real-provider canary               |
| Native App/devices      | Deferred                     | Phase-two decision                                                  | MVP retention gate reached                  |
| Privacy/compliance      | Partial, durable local proof | Erasure, identity suppression and backup-ledger replay exercised    | Production retention/provider/legal review  |
| Testing/observability   | Partial                      | 122 unit tests; hosted quality/smoke/release green                  | Centralize alerts/tracing                   |
| Deployment              | Partial, admission ready     | Remote immutable release + local strict non-secret environment gate | Approve dossier, provision and canary       |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- pnpm workspace with checked-in lockfile and a shared CSS/TypeScript design-token package.
- Parent-qualified pnpm security floors isolate the Taro client on Vite 6.4.3/webpack 5.104.1 and the Next admin on PostCSS 8.5.19 while Vitest remains on Vite 8.1.5; critical/high production audit findings are zero and six moderate Taro build-chain findings remain registered.
- Separate `dist-h5` and `dist-weapp` production roots prevent one platform build from deleting the other.
- NestJS 11 modular API with Zod 4 contracts rendered into a committed OpenAPI 3.0 document.
- Provider-neutral users/identities plus provider-bound opaque Bearer sessions; the WeChat adapter exchanges a short-lived code server-side, namespaces `openid` by AppID, never persists `session_key`, and the development issuer is production-disabled.
- Independent pre-provisioned OIDC operator identities, least-privilege roles and opaque administrator sessions; remote JWKS/issuer/audience/age/nonce and one-time exchange are verified before issuance.
- Exact ticketed support lookup returns only lifecycle, aggregate and custody evidence. Administrator targets are HMAC references in a PostgreSQL-trigger-enforced append-only audit stream.
- Next.js 16 administrator BFF keeps the API credential in an HttpOnly cookie and renders the responsive Evidence Desk without user-content browsing or mutation controls.
- Transactional adult profile, goals, risk eligibility and immutable versioned consent events with optimistic revisions.
- Transactional measurement create/replace/soft-delete with owner-only append-only snapshots, expected revisions and idempotent creation.
- Transactional relational workout aggregates with ordered exercises/sets, completed-only deterministic summaries, expected revisions, idempotent creation and immutable JSON snapshots.
- Transactional nutrition aggregates with food/serving snapshots, canonical grams, deterministic kcal/P/C/F/fiber totals, owner favorites and immutable JSON revisions.
- Timezone-aware read-only Today projection with confirmed evidence, nullable recovery summary and 7/30/90-day totals.
- Versioned weekly plans with deterministic availability/load/equipment constraints, evidence snapshots, substitutions, optimistic decisions and immutable history.
- Parameterized `pg` access to PostgreSQL 18.4 with transactional, checksum-protected SQL migrations.
- React Native for the later native App rather than forcing device integrations into the first client.
- NestJS modular monolith + PostgreSQL + Redis for business services.
- FastAPI worker with authenticated fixture/OpenAI provider adapters, strict structured output, bounded retry and health check.
- Review-only AI runs with explicit versioned consent, minimized context, prompt/model/validator provenance, owner-scoped idempotency, deterministic validation/fallback and exact plan-revision binding.
- Revocable food-photo proposals with per-request consent, signed upload/preview, Sharp metadata stripping, 24-hour expiry, catalog-bound validation, durable deletion paths and confirmation into an unsaved draft only.
- Private S3-compatible object storage with checksummed/conditional writes, production-required SSE, user-scoped photo keys and local pinned MinIO.
- PostgreSQL durable data-operation jobs with transactional enqueue, atomic `SKIP LOCKED` claims, leases, exponential retry, attempts, dead-letter state and aggregate operations evidence.
- User-owned privacy custody with inventory/export/revocation plus `durable-erasure-v2`: immediate access closure, status-token receipt, media/primary/provider/backup dispositions and cleared completed-subject fields.
- HMAC erasure ledger outside the database backup domain and a real `pg_dump → pg_restore → ledger replay` drill that removes a deleted user restored from an older backup.
- UUIDv4 request correlation, stable-route completion logs, a pre-authentication IP gate and post-authentication policy limits backed by HMAC-keyed Redis counters.
- Durable erasure ledger v2 stores unlinkable provider-identity HMAC references outside the backup domain; restore replay recreates identity suppressions before traffic, while legacy v1 entries derive suppressions from identities found in the isolated backup.
- Dependency-free liveness, PostgreSQL+Redis+object-storage readiness and independently token-protected bounded metrics/job evidence; business traffic fails closed when Redis is unavailable and durable deletion retries storage failure.
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.
- Pinned-base, non-root OCI images for API, administrator and AI; API uses a self-contained pnpm deployment closure and administrator uses Next.js standalone output.
- A disposable pinned Compose topology runs a one-shot migration before traffic and black-box verifies image health, dependency readiness, request correlation and administrator security headers. GitHub Actions defines full quality/image smoke plus multi-architecture GHCR publication with provenance.
- The Nest API has typed `runtime` and `metadata` startup policies: production/integration retain dependency checks and maintenance workers, while OpenAPI/CORS inspection and contract generation assemble the real graph without external startup I/O.
- A dependency-free `myfitness-release/v1` control plane binds API, administrator and AI digests to one SemVer tag, full source revision and workflow run; the tag workflow rejects mixed fragments and publishes checksummed, non-overwritable GitHub Release assets.
- A dependency-free `myfitness-managed-environment/v1` admission boundary requires explicit account/budget, distinct public origins, secret-manager references, data-custody owners, telemetry and AI policy evidence before binding the verified release to migration/private-service/canary order and an explicit rollback mode.

## Current risks

| Risk                                                                                   | Level  | Mitigation / next evidence                                                                             |
| -------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Production audit retains six moderate Taro build-chain advisories                      | Medium | Remove through a supported Taro/build-chain upgrade; rerun graph, dual-build and E2E proof             |
| Offline admission cannot prove external references exist or were genuinely approved    | High   | Create/dereference the dossier inside a protected change system; never deploy from local success alone |
| H5 and WeApp build outputs are not bound into the immutable release record             | High   | Package deterministic client artifacts, checksums and source provenance before managed client delivery |
| Scope may expand before the recording loop is proven                                   | High   | Enforce MVP exclusions and one-scope iteration archives                                                |
| Food-photo portion estimates can be misleading                                         | High   | Catalog-bound ranges/confidence, user edit, no auto-write; broaden real-image evaluation               |
| AI may generate unsafe training or diet changes                                        | High   | Deterministic constraints and validators precede model output                                          |
| Production AI retention/region/cost/quality are unverified                             | High   | Keep fixture default and provider receipts `policy_bound`; require approved real canary                |
| Pending AI runs can outlive a crashed orchestration request                            | Medium | Add expiry and reconciliation before shared beta                                                       |
| Fifteen AI eval cases do not establish broad safety                                    | High   | Add expert-reviewed real/obfuscated/injection image and text cases with thresholds                     |
| Local MinIO does not prove production object controls                                  | High   | Configure cloud bucket/KMS/IAM/lifecycle/versioning/replication and exercise outage/restore            |
| Domestic Android health data is fragmented                                             | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate              |
| Brand name “衡迹” is unverified                                                        | Medium | Treat as working name; perform trademark/domain review before public launch                            |
| H5 entry is 305 KiB/largest chunk 589 KiB; WeApp vendor is 417 KiB                     | Medium | Set budgets and split route/provider code before beta                                                  |
| Taro emits non-blocking webpack cache serialization warnings                           | Low    | Track upstream/package compatibility; clean builds and artifacts currently pass                        |
| WeChat identity lacks real credentials/device/domain proof; H5 lacks a release adapter | High   | Exercise a real Mini Program in shared test; select H5 identity and explicit re-registration policy    |
| Enterprise operator OIDC tenant/client and access owner are absent                     | High   | Select provider; exercise provisioning, recertification, disablement and shared login                  |
| Administrator audit lacks independent retention/export and alerts                      | High   | Define retention/owner; ship immutable copy and alert review before real operator access               |
| Local restore replay works; backup/provider operations are unowned                     | High   | Automate backup/retention, independently retain ledger and approve provider controls                   |
| Lost deletion-response token cannot currently be recovered                             | High   | Add idempotent request/status recovery before closed beta                                              |
| Dead-letter recovery has no alert owner or safe service endpoint                       | High   | Centralize alerts; require audited exact-job runbook until a least-privilege tool exists               |
| Process metrics are not centrally scraped and alerts have no owner                     | High   | Deploy private aggregation, dashboards, paging and named incident ownership before beta                |
| Rate limits use uncalibrated fixed windows and exact proxy topology                    | Medium | Load-test policy boundaries and verify `TRUST_PROXY_HOPS` in the shared environment                    |
| Workout status can diverge from set completion in non-client use                       | Medium | Make server derivation authoritative before exposing imports                                           |
| Starter exercise catalog lacks custom/equipment semantics                              | Medium | Model additions only after the manual workout loop informs actual needs                                |
| Starter food values are demonstration data, not release catalog                        | High   | Select licensed/localized versioned provider and attribution before beta                               |
| Energy/macro UI can be harmful for eating-disorder risk                                | High   | Maintain scope exclusion; add screening/content review before adaptive nutrition planning              |
| Deterministic-v1 is explainable but not clinically validated                           | High   | Keep general-guidance claims; add offline evaluation and expert/content review                         |
| A changed plan may look current until the next server action                           | Medium | Server blocks stale accept/modify; add proactive client stale-state refresh                            |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, zero critical/high production dependency audit, and production builds.

## Primary next step

Iteration 21: package H5 and WeApp outputs as deterministic, checksummed, source-bound client release artifacts and extend deployment admission to consume them without weakening the immutable `v0.1.0-rc.1` service record. Iteration 22 then obtains owner-approved account/region/budget and protected references, provisions the managed shared test environment, injects real WeChat/OIDC secrets, deploys all admitted artifacts without general traffic, and exercises custody, telemetry, canary and no-traffic rollback.
