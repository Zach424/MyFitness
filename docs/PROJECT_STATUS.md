# Project status

Last reviewed: 2026-07-19

Stage: revocable food-photo candidates complete locally; privacy and operations next

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                        | Current evidence                                    | Next gate                                    |
| ----------------------- | ----------------------------- | --------------------------------------------------- | -------------------------------------------- |
| Product scope           | Done for MVP baseline         | `docs/product/PRODUCT_BRIEF.md`                     | Validate with target-user interviews         |
| Delivery roadmap        | Done for planning baseline    | `docs/product/ROADMAP.md`                           | Execute iteration 11                         |
| Design language         | Partial, nine flows validated | Core flows + 18 reviewed screenshots                | Large text, keyboard and remaining states    |
| Client: Mini Program/H5 | Partial                       | Record/plan loop + AI note + photo proof            | Add privacy ownership workflows              |
| Admin console           | Pending                       | Architecture only                                   | Content and support requirements frozen      |
| Business API            | Partial                       | Records, plans, AI runs and private photo lifecycle | Add export/deletion/revocation               |
| Domain rules            | Partial                       | Plan + explanation + catalog-bound image validators | Add privacy erasure rules                    |
| AI service              | Partial                       | Text/vision fixture/OpenAI adapters + 15 eval cases | Approved real-provider canary                |
| Native App/devices      | Deferred                      | Phase-two decision                                  | MVP retention gate reached                   |
| Privacy/compliance      | Partial                       | Consent provenance + private expiring photo path    | Revocation, export, erasure and legal review |
| Testing/observability   | Partial                       | 74 unit + 22 integration + 7 worker + 17 E2E        | Add lint, CI, metrics and trace correlation  |
| Deployment              | Partial, local only           | PostgreSQL + FastAPI Compose health                 | Create repeatable shared test environment    |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- pnpm workspace with checked-in lockfile and a shared CSS/TypeScript design-token package.
- Separate `dist-h5` and `dist-weapp` production roots prevent one platform build from deleting the other.
- NestJS 11 modular API with Zod 4 contracts rendered into a committed OpenAPI 3.0 document.
- Provider-neutral users/identities plus opaque Bearer sessions; raw tokens never enter the database and the development issuer is production-disabled.
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
- Revocable food-photo proposals with per-request consent, signed upload/preview, Sharp metadata stripping, 24-hour expiry, catalog-bound validation, immediate deletion paths and confirmation into an unsaved draft only.
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.

## Current risks

| Risk                                                               | Level  | Mitigation / next evidence                                                                 |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| GitHub Git transport is unavailable in the current environment     | High   | Keep local commits; later fetch authenticated remote and replay commits without force-push |
| Scope may expand before the recording loop is proven               | High   | Enforce MVP exclusions and one-scope iteration archives                                    |
| Food-photo portion estimates can be misleading                     | High   | Catalog-bound ranges/confidence, user edit, no auto-write; broaden real-image evaluation   |
| AI may generate unsafe training or diet changes                    | High   | Deterministic constraints and validators precede model output                              |
| Production AI retention/region/cost/quality are unverified         | High   | Keep fixture default; require legal/operations review and approved real-provider canary    |
| Pending AI runs can outlive a crashed orchestration request        | Medium | Add expiry and reconciliation before shared beta                                           |
| Fifteen AI eval cases do not establish broad safety                | High   | Add expert-reviewed real/obfuscated/injection image and text cases with thresholds         |
| Local private photo disk cannot support horizontal production      | High   | Replace with encrypted private object storage, lifecycle policy and durable reconciliation |
| Domestic Android health data is fragmented                         | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate  |
| Brand name “衡迹” is unverified                                    | Medium | Treat as working name; perform trademark/domain review before public launch                |
| H5 entry is 305 KiB/largest chunk 581 KiB; WeApp vendor is 417 KiB | Medium | Set budgets and split route/provider code before beta                                      |
| Taro emits non-blocking webpack cache serialization warnings       | Low    | Track upstream/package compatibility; clean builds and artifacts currently pass            |
| Development session issuer is not production authentication        | High   | Production mode disables it; add verified WeChat/phone adapters before shared deployment   |
| Consent can be recorded but not yet revoked or exported            | High   | Implement privacy workflows, policy review and audit evidence before beta                  |
| API has no production rate limiting or observability yet           | Medium | Add request IDs, metrics, abuse limits and alerting before shared deployment               |
| Workout status can diverge from set completion in non-client use   | Medium | Make server derivation authoritative before exposing imports                               |
| Starter exercise catalog lacks custom/equipment semantics          | Medium | Model additions only after the manual workout loop informs actual needs                    |
| Starter food values are demonstration data, not release catalog    | High   | Select licensed/localized versioned provider and attribution before beta                   |
| Energy/macro UI can be harmful for eating-disorder risk            | High   | Maintain scope exclusion; add screening/content review before adaptive nutrition planning  |
| Deterministic-v1 is explainable but not clinically validated       | High   | Keep general-guidance claims; add offline evaluation and expert/content review             |
| A changed plan may look current until the next server action       | Medium | Server blocks stale accept/modify; add proactive client stale-state refresh                |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, and production builds.

## Primary next step

Iteration 11: implement the user privacy ownership path—data inventory/export/account erasure and consent revocation—then freeze admin RBAC, audit/support and retention/incident runbooks.
