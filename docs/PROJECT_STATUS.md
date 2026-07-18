# Project status

Last reviewed: 2026-07-19

Stage: review-only AI plan explanations complete locally; food-photo assistance next

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                         | Current evidence                                 | Next gate                                      |
| ----------------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
| Product scope           | Done for MVP baseline          | `docs/product/PRODUCT_BRIEF.md`                  | Validate with target-user interviews           |
| Delivery roadmap        | Done for planning baseline     | `docs/product/ROADMAP.md`                        | Execute iteration 10                           |
| Design language         | Partial, seven flows validated | Core flows + 14 reviewed screenshots             | Large text, keyboard and remaining states      |
| Client: Mini Program/H5 | Partial                        | Full record/plan loop + AI margin note           | Add photo candidate review                     |
| Admin console           | Pending                        | Architecture only                                | Content and support requirements frozen        |
| Business API            | Partial                        | Records, plans and versioned AI explanation runs | Add private photo lifecycle                    |
| Domain rules            | Partial                        | Plan rules + AI minimization/validators/fallback | Extend validators to image candidates          |
| AI service              | Partial                        | Fixture/OpenAI adapters + 7-case offline eval    | Approved real-provider canary and image path   |
| Native App/devices      | Deferred                       | Phase-two decision                               | MVP retention gate reached                     |
| Privacy/compliance      | Partial                        | Purpose/version consent events + AI rules        | Revocation, inventory, retention, legal review |
| Testing/observability   | Partial                        | 66 unit + 18 integration + 5 worker + 15 E2E     | Add lint, CI, metrics and trace correlation    |
| Deployment              | Partial, local only            | PostgreSQL + FastAPI Compose health              | Create repeatable shared test environment      |

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
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.

## Current risks

| Risk                                                             | Level  | Mitigation / next evidence                                                                 |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| GitHub Git transport is unavailable in the current environment   | High   | Keep local commits; later fetch authenticated remote and replay commits without force-push |
| Scope may expand before the recording loop is proven             | High   | Enforce MVP exclusions and one-scope iteration archives                                    |
| Food-photo portion estimates can be misleading                   | High   | Display ranges and uncertainty; require confirmation before persistence                    |
| AI may generate unsafe training or diet changes                  | High   | Deterministic constraints and validators precede model output                              |
| Production AI retention/region/cost/quality are unverified       | High   | Keep fixture default; require legal/operations review and approved real-provider canary    |
| Pending AI runs can outlive a crashed orchestration request      | Medium | Add expiry and reconciliation before shared beta                                           |
| Seven AI eval cases do not establish broad safety                | High   | Add expert-reviewed, obfuscated and injection cases with regression thresholds             |
| Domestic Android health data is fragmented                       | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate  |
| Brand name “衡迹” is unverified                                  | Medium | Treat as working name; perform trademark/domain review before public launch                |
| H5 entry is 303 KiB and WeApp plan page is 458 KiB               | Medium | Set measured platform budgets and split route/provider code before beta                    |
| Taro emits non-blocking webpack cache serialization warnings     | Low    | Track upstream/package compatibility; clean builds and artifacts currently pass            |
| Development session issuer is not production authentication      | High   | Production mode disables it; add verified WeChat/phone adapters before shared deployment   |
| Consent can be recorded but not yet revoked or exported          | High   | Implement privacy workflows, policy review and audit evidence before beta                  |
| API has no production rate limiting or observability yet         | Medium | Add request IDs, metrics, abuse limits and alerting before shared deployment               |
| Workout status can diverge from set completion in non-client use | Medium | Make server derivation authoritative before exposing imports                               |
| Starter exercise catalog lacks custom/equipment semantics        | Medium | Model additions only after the manual workout loop informs actual needs                    |
| Starter food values are demonstration data, not release catalog  | High   | Select licensed/localized versioned provider and attribution before beta                   |
| Energy/macro UI can be harmful for eating-disorder risk          | High   | Maintain scope exclusion; add screening/content review before adaptive nutrition planning  |
| Deterministic-v1 is explainable but not clinically validated     | High   | Keep general-guidance claims; add offline evaluation and expert/content review             |
| A changed plan may look current until the next server action     | Medium | Server blocks stale accept/modify; add proactive client stale-state refresh                |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, and production builds.

## Primary next step

Iteration 10: add food-photo assistance as an explicitly confirmed candidate workflow, including private upload, EXIF stripping, retention deletion, uncertainty, alternatives and no automatic record writes.
