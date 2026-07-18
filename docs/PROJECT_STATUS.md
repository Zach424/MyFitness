# Project status

Last reviewed: 2026-07-18

Stage: adult onboarding complete; body and recovery recording next

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                       | Current evidence                          | Next gate                                      |
| ----------------------- | ---------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Product scope           | Done for MVP baseline        | `docs/product/PRODUCT_BRIEF.md`           | Validate with target-user interviews           |
| Delivery roadmap        | Done for planning baseline   | `docs/product/ROADMAP.md`                 | Execute iteration 4                            |
| Design language         | Partial, two flows validated | Today/onboarding docs + four screenshots  | Validate remaining states and 320 px viewport  |
| Client: Mini Program/H5 | Partial                      | Builds + real onboarding E2E              | Implement body/recovery record flows           |
| Admin console           | Pending                      | Architecture only                         | Content and support requirements frozen        |
| Business API            | Partial                      | Auth, profile, consent and records API    | Add edit/delete/history record lifecycle       |
| Domain rules            | Partial                      | Measurements + adult eligibility rules    | Add workout and nutrition domains              |
| AI service              | Pending                      | Safety boundary listed                    | Offline fixture pipeline and validators        |
| Native App/devices      | Deferred                     | Phase-two decision                        | MVP retention gate reached                     |
| Privacy/compliance      | Partial                      | Purpose/version consent events + AI rules | Revocation, inventory, retention, legal review |
| Testing/observability   | Partial                      | 28 unit + 8 integration + 2 browser E2E   | Add lint, CI, metrics and trace correlation    |
| Deployment              | Partial, local only          | PostgreSQL Compose + runtime health       | Create repeatable shared test environment      |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- pnpm workspace with checked-in lockfile and a shared CSS/TypeScript design-token package.
- Separate `dist-h5` and `dist-weapp` production roots prevent one platform build from deleting the other.
- NestJS 11 modular API with Zod 4 contracts rendered into a committed OpenAPI 3.0 document.
- Provider-neutral users/identities plus opaque Bearer sessions; raw tokens never enter the database and the development issuer is production-disabled.
- Transactional adult profile, goals, risk eligibility and immutable versioned consent events with optimistic revisions.
- Parameterized `pg` access to PostgreSQL 18.4 with transactional, checksum-protected SQL migrations.
- React Native for the later native App rather than forcing device integrations into the first client.
- NestJS modular monolith + PostgreSQL + Redis for business services.
- FastAPI worker boundary for model/vision orchestration when AI implementation begins.
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.

## Current risks

| Risk                                                             | Level  | Mitigation / next evidence                                                                 |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| GitHub Git transport is unavailable in the current environment   | High   | Keep local commits; later fetch authenticated remote and replay commits without force-push |
| Scope may expand before the recording loop is proven             | High   | Enforce MVP exclusions and one-scope iteration archives                                    |
| Food-photo portion estimates can be misleading                   | High   | Display ranges and uncertainty; require confirmation before persistence                    |
| AI may generate unsafe training or diet changes                  | High   | Deterministic constraints and validators precede model output                              |
| Domestic Android health data is fragmented                       | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate  |
| Brand name “衡迹” is unverified                                  | Medium | Treat as working name; perform trademark/domain review before public launch                |
| H5 entrypoint is 300 KiB, above webpack's 244 KiB recommendation | Medium | Set a measured budget and split routes/vendor code as feature pages are added              |
| Taro emits non-blocking webpack cache serialization warnings     | Low    | Track upstream/package compatibility; clean builds and artifacts currently pass            |
| Development session issuer is not production authentication      | High   | Production mode disables it; add verified WeChat/phone adapters before shared deployment   |
| Consent can be recorded but not yet revoked or exported          | High   | Implement privacy workflows, policy review and audit evidence before beta                  |
| API has no production rate limiting or observability yet         | Medium | Add request IDs, metrics, abuse limits and alerting before shared deployment               |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, and production builds.

## Primary next step

Iteration 4: implement body and recovery recording through the real API. Add create/list/edit/delete/history screens, confirmed-versus-estimated states, optimistic edits, unit/timezone correctness, empty/loading/offline/error handling, and end-to-end ownership checks.
