# Project status

Last reviewed: 2026-07-18

Stage: Client foundation complete; API foundation next

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module                  | Status                        | Current evidence                       | Next gate                                     |
| ----------------------- | ----------------------------- | -------------------------------------- | --------------------------------------------- |
| Product scope           | Done for MVP baseline         | `docs/product/PRODUCT_BRIEF.md`        | Validate with target-user interviews          |
| Delivery roadmap        | Done for planning baseline    | `docs/product/ROADMAP.md`              | Execute iteration 2                           |
| Design language         | Done for Today-shell baseline | Design doc + two reviewed screenshots  | Validate remaining states and 320 px viewport |
| Client: Mini Program/H5 | Partial                       | H5/WeApp builds + fixture Today shell  | Connect typed API and implement record flows  |
| Admin console           | Pending                       | Architecture only                      | Content and support requirements frozen       |
| Business API            | Pending                       | Architecture only                      | Health-record contract and database migration |
| Domain rules            | Pending                       | Product constraints listed             | Units and provenance schemas tested           |
| AI service              | Pending                       | Safety boundary listed                 | Offline fixture pipeline and validators       |
| Native App/devices      | Deferred                      | Phase-two decision                     | MVP retention gate reached                    |
| Privacy/compliance      | Partial                       | Data classes and principles identified | Data inventory, consent map, legal review     |
| Testing/observability   | Partial                       | 6 tests, typecheck, builds, browser QA | Add lint, CI and API integration coverage     |
| Deployment              | Pending                       | Local production artifacts only        | Create repeatable test environment            |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- pnpm workspace with checked-in lockfile and a shared CSS/TypeScript design-token package.
- Separate `dist-h5` and `dist-weapp` production roots prevent one platform build from deleting the other.
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

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, and production builds.

## Primary next step

Iteration 2: implement the API foundation and health-record contract with PostgreSQL migration, OpenAPI output, provenance/unit tests, and a reproducible local health check. Authentication, AI and production deployment remain outside this round.
