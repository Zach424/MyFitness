# Project status

Last reviewed: 2026-07-18

Stage: Foundation

Primary release target: WeChat Mini Program + responsive H5

## Objective

MyFitness / 衡迹 turns body, training, nutrition, and recovery records into safe, explainable, user-editable daily actions and weekly plans. The product is a general fitness and lifestyle tool, not a medical diagnosis or treatment product.

## Module status

| Module | Status | Current evidence | Next gate |
| --- | --- | --- | --- |
| Product scope | Done for MVP baseline | `docs/product/PRODUCT_BRIEF.md` | Validate with target-user interviews |
| Delivery roadmap | Done for planning baseline | `docs/product/ROADMAP.md` | Convert iteration 1 into executable backlog |
| Design language | Done for baseline, unvalidated | `docs/design/DESIGN_SYSTEM.md` | Implement shell and review screenshots |
| Client: Mini Program/H5 | Pending | Architecture only | Taro H5 boots and renders the Today shell |
| Admin console | Pending | Architecture only | Content and support requirements frozen |
| Business API | Pending | Architecture only | Health-record contract and database migration |
| Domain rules | Pending | Product constraints listed | Units and provenance schemas tested |
| AI service | Pending | Safety boundary listed | Offline fixture pipeline and validators |
| Native App/devices | Deferred | Phase-two decision | MVP retention gate reached |
| Privacy/compliance | Partial | Data classes and principles identified | Data inventory, consent map, legal review |
| Testing/observability | Pending | Iteration rules defined | CI runs lint, typecheck, tests and build |
| Deployment | Pending | Target shape documented | Test environment and release checklist |

Status vocabulary: `Done` means validated for the present stage, `Partial` means usable but missing a named gate, `Pending` means not implemented, and `Deferred` means intentionally outside the current release.

## Current architecture

- Taro 4 + React + TypeScript for Mini Program and H5.
- React Native for the later native App rather than forcing device integrations into the first client.
- NestJS modular monolith + PostgreSQL + Redis for business services.
- FastAPI worker boundary for model/vision orchestration when AI implementation begins.
- Shared contracts, domain rules, and design tokens in a pnpm monorepo.

## Current risks

| Risk | Level | Mitigation / next evidence |
| --- | --- | --- |
| GitHub Git transport is unavailable in the current environment | High | Keep local commits; later fetch authenticated remote and replay commits without force-push |
| Scope may expand before the recording loop is proven | High | Enforce MVP exclusions and one-scope iteration archives |
| Food-photo portion estimates can be misleading | High | Display ranges and uncertainty; require confirmation before persistence |
| AI may generate unsafe training or diet changes | High | Deterministic constraints and validators precede model output |
| Domestic Android health data is fragmented | Medium | Defer device sync; start HealthKit/Health Connect/Huawei feasibility after retention gate |
| Brand name “衡迹” is unverified | Medium | Treat as working name; perform trademark/domain review before public launch |

## Quality gates

The MVP cannot enter public beta until all of the following are reproducible:

- A new user can complete onboarding, record body/training/nutrition/recovery data, view trends, receive a plan, and delete/export their data.
- AI-derived values never silently become confirmed records.
- Plan output passes schema, training-load, energy-intake, and risk-phrase validation.
- Permissions, account deletion, photo retention, audit logging, backups, and incident rollback are exercised.
- CI passes formatting, linting, type checks, unit tests, integration tests, and production builds.

## Primary next step

Iteration 1: create the pnpm workspace, Taro client, shared design-token package, and a fixture-backed Today shell that runs in H5 with a screenshot review. No authentication, API, AI, or real persistence in this round.
