# Project status

Last reviewed: 2026-08-04

Stage: internal alpha locally runnable; the client release boundary now has measured H5/WeApp budgets, rejects accidental full validation-runtime rebundling and is enforced in both CI and release packaging. H5 onboarding and Week Fold are browser-proven at 320 px with 125% root text; the AI consent control is Tab-focusable, visibly focused and Space/Enter operable. Weekly plans still carry server-projected profile/eligibility freshness, while server-authoritative workout completion and privacy-first progress photos remain locally implemented. Both first-release client candidate contracts, H5 OIDC browser/API trust, immutable workflow dependencies, exact tag/main/CI release-source qualification, combined admission, recoverable erasure receipts, crash-safe AI lifecycle, adversarial output validation and reproducible evaluation artifacts remain locally green. Owner-operated cloud, domain and real-provider work is explicitly parked while locally verifiable product gaps continue.

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                          | Current evidence                                                        | Next gate                                   |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| Product scope           | Done for MVP baseline           | `docs/product/PRODUCT_BRIEF.md`                                         | Validate with target-user interviews        |
| Delivery roadmap        | Done for planning baseline      | `docs/product/ROADMAP.md`                                               | Continue local gaps; keep external gates    |
| Design language         | Partial, fourteen flows tested  | Core flows + 320 px/large-text/keyboard proof + 31 reviewed screenshots | Screen readers and remaining state matrix   |
| Client: Mini Program/H5 | Partial, candidate paths local  | H5/WeApp measured budgets plus candidate identity/release contracts     | Real providers/domains/device/browser proof |
| Admin console           | Partial, local slice done       | OIDC BFF, exact lookup, role split and Evidence Rail exercised          | Select IdP, owner, retention and deployment |
| Business API            | Partial                         | Verified WeChat/OIDC identity plus self-contained OCI runtime           | Shared deployment and real credential proof |
| Domain rules            | Partial                         | Workout authority + plan freshness + safety/privacy validators          | Add release policy enforcement              |
| AI service              | Partial                         | Crash-safe runs + adversarial text/vision validators + 23 evals         | Expert corpus + approved provider canary    |
| Native App/devices      | Deferred                        | Phase-two decision                                                      | MVP retention gate reached                  |
| Privacy/compliance      | Partial, durable local proof    | Purpose-scoped photo consent/export/deletion + restore replay tested    | Production retention/provider/legal review  |
| Testing/observability   | Partial                         | 200 unit, 50 integration, 25 browser tests + client quality gate        | Centralize telemetry after account approval |
| Deployment              | Partial, source/admission ready | Immutable actions + tag/main/CI + service/client/environment gates      | Approve dossier, provision and canary       |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- pnpm workspace with checked-in lockfile and a shared CSS/TypeScript design-token package.
- A dependency-free project-status mirror selects the most recent open Obsidian vault (or an explicit override), copies `docs/PROJECT_STATUS.md` byte-for-byte inside that vault and independently rejects stale or path-escaping targets. The repository copy remains authoritative.
- Parent-qualified pnpm security floors isolate the Taro client on Vite 6.4.3/webpack 5.104.1 and the Next admin on PostCSS 8.5.19 while Vitest remains on Vite 8.1.5; critical/high production audit findings are zero and six moderate Taro build-chain findings remain registered.
- Separate `dist-h5` and `dist-weapp` production roots prevent one platform build from deleting the other. A dependency-free `myfitness-client-quality/v1` verifier measures the index-derived H5 entrypoint, largest async route, WeApp vendor/page bundles and total trees; strict checked-in budgets run after both builds in CI and before immutable release assembly.
- Browser code imports dependency-free contract constant subpaths instead of the CommonJS/Zod umbrella. The two public identity responses retain exact-key, URL, UUID, provider and offset-datetime checks through a small client guard while the shared Zod schemas remain the server/test authority. Bundle scanning fails if the removed full validation-runtime markers return.
- NestJS 11 modular API with Zod 4 contracts rendered into a committed OpenAPI 3.0 document.
- Provider-neutral users/identities plus provider-bound opaque Bearer sessions. WeChat exchanges a short-lived code server-side, namespaces `openid` by AppID and never persists `session_key`. H5 creates tab-scoped state/nonce/verifier values, derives PKCE S256, removes callback parameters before network work, consumes the transaction once, exchanges code + PKCE at the API, verifies remote JWKS/algorithm/issuer/audience/age/nonce, and stores only an issuer/subject digest. The development issuer is production-disabled; cross-provider account linking is intentionally absent.
- Independent pre-provisioned OIDC operator identities, least-privilege roles and opaque administrator sessions; remote JWKS/issuer/audience/age/nonce and one-time exchange are verified before issuance.
- Exact ticketed support lookup returns only lifecycle, aggregate and custody evidence. Administrator targets are HMAC references in a PostgreSQL-trigger-enforced append-only audit stream.
- Next.js 16 administrator BFF keeps the API credential in an HttpOnly cookie and renders the responsive Evidence Desk without user-content browsing or mutation controls.
- Transactional adult profile, goals, risk eligibility and immutable versioned consent events with optimistic revisions.
- Transactional measurement create/replace/soft-delete with owner-only append-only snapshots, expected revisions and idempotent creation.
- Transactional relational workout aggregates with ordered exercises/sets, completed-only deterministic summaries, server-authoritative completion status, expected revisions, status-insensitive idempotent creation and immutable JSON snapshots.
- Transactional nutrition aggregates with food/serving snapshots, canonical grams, deterministic kcal/P/C/F/fiber totals, owner favorites and immutable JSON revisions.
- Timezone-aware read-only Today projection with confirmed evidence, nullable recovery summary and 7/30/90-day totals.
- Versioned weekly plans with deterministic availability/load/equipment constraints, evidence snapshots, substitutions, optimistic decisions and immutable history. The list response adds a non-persisted server freshness projection (`current`, `profile_changed`, `eligibility_blocked`, or defensive `onboarding_required`) from current profile revision and eligibility. Permission literals keep accept/modify and AI explanation closed when stale while skip remains available; generation/decisions and immutable history keep their original aggregate contract.
- Parameterized `pg` access to PostgreSQL 18.4 with transactional, checksum-protected SQL migrations.
- React Native for the later native App rather than forcing device integrations into the first client.
- NestJS modular monolith + PostgreSQL + Redis for business services.
- FastAPI worker with authenticated fixture/OpenAI provider adapters, strict structured output, bounded retry and health check. The v2 food-photo prompt treats image text as untrusted data and rejects instruction-dominant images rather than following or repeating their content.
- Review-only AI runs with explicit versioned consent, minimized context, prompt/model/validator provenance, owner-scoped idempotency, deterministic validation/fallback and exact plan-revision binding. Versioned v2 output safety performs NFKC normalization, removes format characters and compacts separators before checking medical/prescriptive/control-language policy; number grounding separately normalizes full-width and separated digits without rewriting stored prose. Every reservation stores a separately validated recovery result and database deadline beyond the worker timeout; runtime startup/interval reconciliation uses atomic `SKIP LOCKED` claims, while private operations routes expose aggregate health and a bounded manual pass without user content.
- Revocable food-photo proposals with per-request consent, signed upload/preview, Sharp metadata stripping, 24-hour expiry, catalog-bound and display-copy validation, durable deletion paths and confirmation into an unsaved draft only. Historical v1 provenance remains readable while new worker calls require prompt/validator v2.
- Privacy-first progress photos with declared front/side/back view, separate analysis/retention consent, Sharp metadata stripping, four deterministic capture-quality checks, 24-hour analysis-only expiry, retained same-view onion-skin comparison, explicit deletion and no posture/body-composition inference.
- Private S3-compatible object storage with checksummed/conditional writes, production-required SSE, purpose-scoped `food`/`progress` keys, legacy deletion compatibility and local pinned MinIO.
- PostgreSQL durable data-operation jobs with transactional enqueue, atomic `SKIP LOCKED` claims, leases, exponential retry, attempts, dead-letter state and aggregate operations evidence.
- User-owned privacy custody with inventory/export/revocation plus `durable-erasure-v2`: immediate access closure, status-token receipt, media/primary/provider/backup dispositions and cleared completed-subject fields.
- Recoverable account erasure uses a 15-minute single-use intent, stores only SHA-256 token hashes, persists the secret on the client before deletion and reuses it for a rate-limited no-store receipt lookup after the account session is closed.
- HMAC erasure ledger outside the database backup domain and a real `pg_dump → pg_restore → ledger replay` drill that removes a deleted user restored from an older backup.
- UUIDv4 request correlation, stable-route completion logs, a pre-authentication IP gate and post-authentication policy limits backed by HMAC-keyed Redis counters.
- Durable erasure ledger v2 stores unlinkable provider-identity HMAC references outside the backup domain; restore replay recreates identity suppressions before traffic, while legacy v1 entries derive suppressions from identities found in the isolated backup.
- Dependency-free liveness, PostgreSQL+Redis+object-storage readiness and independently token-protected bounded metrics/job evidence; business traffic fails closed when Redis is unavailable and durable deletion retries storage failure.
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.
- Pinned-base, non-root OCI images for API, administrator and AI; API uses a self-contained pnpm deployment closure and administrator uses Next.js standalone output.
- A disposable pinned Compose topology runs a one-shot migration before traffic and black-box verifies image health, dependency readiness, request correlation and administrator security headers. GitHub Actions defines full quality/image smoke plus multi-architecture GHCR publication with provenance.
- The Nest API has typed `runtime` and `metadata` startup policies: production/integration retain dependency checks and maintenance workers, while OpenAPI/CORS inspection and contract generation assemble the real graph without external startup I/O.
- Both GitHub workflows pin every external action to a reviewed full commit recorded in `myfitness-github-actions-lock/v1`; an offline discovery test rejects mutable/unknown refs and weekly Dependabot proposals expose upgrades without automatic trust.
- A dependency-free `myfitness-release-qualification/v1` gate resolves lightweight or annotated remote tags, proves the exact commit remains in current `main` and selects that SHA's successful `main` push CI before registry login or client packaging. The strict record is rechecked against the release workflow and retained as an immutable Release asset.
- A dependency-free `myfitness-release/v1` control plane binds API, administrator and AI digests to one qualified SemVer tag, full source revision and workflow run; the tag workflow rejects mixed fragments and publishes checksummed, non-overwritable GitHub Release assets.
- A dependency-free `myfitness-client-release/v1` control plane packages sorted, fixed-metadata USTAR H5/WeApp roots, verifies canonical bytes and tree digests, and binds both platforms to one source/workflow/API base. H5 is a `candidate` with OIDC identity and required callback assets; WeApp is a `candidate` with WeChat identity. Both remain controlled-preview artifacts until real identity and custody proof.
- `myfitness-managed-environment/v1` plus `myfitness-deployment-admission/v2` require explicit account/budget, distinct public origins, secret-manager references, data-custody owners, telemetry and AI policy evidence before binding both verified release planes to migration/private-service/canary order, guarded client delivery and an explicit rollback mode.

## Current risks

| Risk                                                                                        | Level  | Mitigation / next evidence                                                                               |
| ------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| Production audit retains six moderate Taro build-chain advisories                           | Medium | Remove through a supported Taro/build-chain upgrade; rerun graph, dual-build and E2E proof               |
| Offline admission cannot prove external references exist or were genuinely approved         | High   | Create/dereference the dossier inside a protected change system; never deploy from local success alone   |
| The published `v0.1.0-rc.1` predates client release and source-qualification assets         | Medium | Set an approved client API URL and publish/verify a new qualified tag; never mutate the existing release |
| Pinned GitHub Actions can age after their reviewed upstream releases                        | Medium | Review weekly Dependabot proposals, upstream tags/source and the synchronized lock; require complete CI  |
| Scope may expand before the recording loop is proven                                        | High   | Enforce MVP exclusions and one-scope iteration archives                                                  |
| Food-photo portion estimates can be misleading                                              | High   | Catalog-bound ranges/confidence, user edit, no auto-write; broaden real-image evaluation                 |
| Progress photos can be over-interpreted or retained longer than expected                    | High   | Capture-only checks/no body score, separate retention consent, scoped deletion; real-user/policy review  |
| AI may generate unsafe training or diet changes                                             | High   | Deterministic constraints and validators precede model output                                            |
| Production AI retention/region/cost/quality are unverified                                  | High   | Keep fixture default and provider receipts `policy_bound`; require approved real canary                  |
| Twenty-three deterministic AI cases do not establish real-world safety                      | High   | Add expert-reviewed real/obfuscated/injection image and text cases plus slice thresholds                 |
| Local MinIO does not prove production object controls                                       | High   | Configure cloud bucket/KMS/IAM/lifecycle/versioning/replication and exercise outage/restore              |
| Domestic Android health data is fragmented                                                  | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate                |
| Brand name “衡迹” is unverified                                                             | Medium | Treat as working name; perform trademark/domain review before public launch                              |
| H5 entry remains 305 KiB (above webpack's 244 KiB advisory); largest async route is 189 KiB | Medium | Enforced 320/200 KiB and 1.75 MB H5 budgets prevent growth; split app/Taro entry before beta             |
| Taro emits non-blocking webpack cache serialization warnings                                | Low    | Track upstream/package compatibility; clean builds and artifacts currently pass                          |
| WeChat lacks real device/domain proof; H5 OIDC has only browser/provider-double proof       | High   | Exercise both real adapters/domains, callback hosting and explicit re-registration policy                |
| Enterprise operator OIDC tenant/client and access owner are absent                          | High   | Select provider; exercise provisioning, recertification, disablement and shared login                    |
| Administrator audit lacks independent retention/export and alerts                           | High   | Define retention/owner; ship immutable copy and alert review before real operator access                 |
| Local restore replay works; backup/provider operations are unowned                          | High   | Automate backup/retention, independently retain ledger and approve provider controls                     |
| A receipt bearer secret remains in client application storage until explicit removal        | Medium | Review secure platform storage/shared-device handling and expiry policy before closed beta               |
| Dead-letter recovery has no alert owner or safe service endpoint                            | High   | Centralize alerts; require audited exact-job runbook until a least-privilege tool exists                 |
| Process metrics are not centrally scraped and alerts have no owner                          | High   | Deploy private aggregation, dashboards, paging and named incident ownership before beta                  |
| Rate limits use uncalibrated fixed windows and exact proxy topology                         | Medium | Load-test policy boundaries and verify `TRUST_PROXY_HOPS` in the shared environment                      |
| Starter exercise catalog lacks custom/equipment semantics                                   | Medium | Model additions only after the manual workout loop informs actual needs                                  |
| Starter food values are demonstration data, not release catalog                             | High   | Select licensed/localized versioned provider and attribution before beta                                 |
| Energy/macro UI can be harmful for eating-disorder risk                                     | High   | Maintain scope exclusion; add screening/content review before adaptive nutrition planning                |
| Deterministic-v1 is explainable but not clinically validated                                | High   | Keep general-guidance claims; add offline evaluation and expert/content review                           |
| Plan freshness follows profile revision/eligibility, not later workout/meal evidence        | Medium | Define a bounded evidence-refresh policy/fingerprint before labeling record drift as plan staleness      |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, zero critical/high production dependency audit, and production builds.
- H5 and WeApp production trees pass checked-in entry/route/vendor/page/total budgets and the client validation-runtime regression scan.

## Primary next step

Iteration 35: define bounded plan freshness for record evidence without making every new workout or meal invalidate the week. Version a deterministic evidence fingerprint/policy over the plan's existing recent-record snapshot, project a human-readable refresh reason and safe user choice, preserve immutable history and server write guards, and prove no-op versus material-drift cases through contracts, PostgreSQL and H5. Owner-operated cloud account/budget, domain/TLS, real WeChat/OIDC, data-custody owners, centralized telemetry, policy/filing decisions and any approved paid-provider canary remain mandatory external inputs but are parked until the user supplies them; do not describe local MinIO, fixture AI or candidate artifacts as public production.
