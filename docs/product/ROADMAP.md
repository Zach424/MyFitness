# Delivery roadmap

The roadmap is organized as controlled iterations. A round may take several working sessions, but it ends only after implementation, validation, archive update, and a commit.

Progress snapshot (2026-07-19): iterations 0–10 are complete locally; iteration 11 is next. The product now covers authenticated records, Today/trends, versioned deterministic plans, consented review-only AI explanations, and revocable food-photo candidates on H5/WeApp. Production model/provider and shared deployment remain gated.

| Iteration | Primary scope                                       | Exit evidence                                                                              |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0         | Product, design, architecture, iteration governance | Baseline documents cross-link, repository status reviewed, local commit created            |
| 1         | Multi-end client foundation and Today shell         | H5 boots; Mini Program build is checked; screenshot reviewed; token tests pass             |
| 2         | API foundation and health-record contract           | PostgreSQL migration, OpenAPI contract, provenance/unit tests, local stack health check    |
| 3         | Adult onboarding and goals                          | Profile flow persists through API; consent version recorded; E2E happy/error paths pass    |
| 4         | Body and recovery recording                         | Create/edit/delete/history flows; trends use correct time/unit semantics                   |
| 5         | Workout recording                                   | Exercise/set model, repeat-last-workout flow, volume calculations and E2E tests            |
| 6         | Nutrition recording                                 | Search/favorites/manual portions; macro totals and revision history verified               |
| 7         | Today and trend loop                                | Plan-vs-actual rail uses real API data; empty/loading/offline/error states tested          |
| 8         | Deterministic plan engine                           | Structured plan contract, substitutions, load constraints and versioning                   |
| 9         | AI explanation and plan orchestration               | Model gateway, prompt/version logs, validators, offline fixtures and evaluation report     |
| 10        | Food-photo assistance                               | EXIF removal, signed upload, uncertainty/confirmation, retention deletion tests            |
| 11        | Privacy, admin and operations                       | Export/deletion workflow, RBAC, audit UI, support and incident runbooks                    |
| 12        | Beta hardening and release                          | Security review, performance budget, accessibility, store/filing artifacts, staged rollout |
| 13        | Native App feasibility and device sync              | Retention gate reviewed; HealthKit/Health Connect/Huawei proof of concept                  |

## Release gates

### Internal alpha

- Iterations 1–8 complete.
- Entire non-AI record and planning path works with deterministic fixtures.
- No known critical data-loss or authorization defects.

### Closed beta

- Iterations 9–11 complete.
- AI evaluation set is versioned and safety validators block known high-risk cases.
- Data export and deletion are exercised end to end.
- Support, monitoring, cost limits, rollback, and incident ownership are assigned.

### Public release

- Iteration 12 complete.
- Applicable ICP/APP/Mini Program privacy/AI registration and content-labeling work is reviewed.
- Store materials match actual data practices and product claims.
- Release starts with a small cohort and automatic rollback thresholds.

## Change control

New feature requests enter the risk/backlog section of the next iteration archive. They do not interrupt an active round unless they fix a correctness, security, privacy, or data-loss issue on the current critical path.
