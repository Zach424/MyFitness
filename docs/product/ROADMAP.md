# Delivery roadmap

The roadmap is organized as controlled iterations. A round may take several working sessions, but it ends only after implementation, validation, archive update, and a commit.

Progress snapshot (2026-07-20): iterations 0–25 are complete locally, including green hosted quality/smoke through iteration 23, verified service-only `v0.1.0-rc.1` assets, strict managed-environment admission, deterministic source-bound H5/WeApp TARs, recoverable account-erasure receipts, crash-safe AI explanation reconciliation, v2 adversarial output validation and byte-reproducible evaluation reports. Iteration 24's hosted formatting failure is preserved in its archive and corrected by iteration 25 instead of rewriting history. The externally gated managed deployment moved to iteration 26 because no owner-approved account, budget, domain, client API URL or protected credential references exist yet; this risk-reduction round did not invent them. Managed infrastructure, real WeChat credentials/device/domain proof, H5 production identity, cloud custody, centralized alerting, expert review and model/provider approval remain gated.

| Iteration | Primary scope                                       | Exit evidence                                                                                    |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0         | Product, design, architecture, iteration governance | Baseline documents cross-link, repository status reviewed, local commit created                  |
| 1         | Multi-end client foundation and Today shell         | H5 boots; Mini Program build is checked; screenshot reviewed; token tests pass                   |
| 2         | API foundation and health-record contract           | PostgreSQL migration, OpenAPI contract, provenance/unit tests, local stack health check          |
| 3         | Adult onboarding and goals                          | Profile flow persists through API; consent version recorded; E2E happy/error paths pass          |
| 4         | Body and recovery recording                         | Create/edit/delete/history flows; trends use correct time/unit semantics                         |
| 5         | Workout recording                                   | Exercise/set model, repeat-last-workout flow, volume calculations and E2E tests                  |
| 6         | Nutrition recording                                 | Search/favorites/manual portions; macro totals and revision history verified                     |
| 7         | Today and trend loop                                | Plan-vs-actual rail uses real API data; empty/loading/offline/error states tested                |
| 8         | Deterministic plan engine                           | Structured plan contract, substitutions, load constraints and versioning                         |
| 9         | AI explanation and plan orchestration               | Model gateway, prompt/version logs, validators, offline fixtures and evaluation report           |
| 10        | Food-photo assistance                               | EXIF removal, signed upload, uncertainty/confirmation, retention deletion tests                  |
| 11        | User privacy ownership                              | Inventory, portable export, optional-consent revocation and primary-store erasure exercised      |
| 12        | API operational perimeter                           | Correlation, Redis abuse limits, health/metrics, outage tests and incident runbook               |
| 13        | Production dependency remediation                   | Zero critical/high audit findings plus full type/test/dual-build/E2E compatibility evidence      |
| 14        | Administrator access and support                    | Operator identity, RBAC, immutable audit and read-only support workflow exercised                |
| 15        | Durable data operations                             | Durable jobs, private object storage, fault retries, restore ledger and provider disposition     |
| 16        | Verified WeChat user identity                       | Server code exchange, provider-bound sessions, erasure suppression and WeApp build proof         |
| 17        | Reproducible deployment artifacts                   | Non-root OCI images, migration gate, local topology proof, CI/release workflow and rollback unit |
| 18        | Hermetic CI bootstrap                               | Dependency-free unit/contract generation, Node 24 actions and green hosted quality/image smoke   |
| 19        | Immutable OCI release promotion                     | One strict digest manifest, provenance, candidate GHCR/GitHub Release and pull proof             |
| 20        | Managed environment admission                       | Strict non-secret inventory, release/checksum binding, ordered plan and explicit rollback        |
| 21        | Immutable client delivery artifacts                 | Deterministic H5/WeApp TARs, checksums, source/API binding and byte-level admission integration  |
| 22        | Recoverable account-erasure receipts                | Single-use intent, hashed secret, lost-response/reload recovery and restore-safe proof           |
| 23        | Crash-safe AI explanation lifecycle                 | Durable deadline/fallback, startup/interval recovery, aggregate operations and race proof        |
| 24        | Adversarial AI output safety                        | Versioned normalization, instruction-image boundary and exact-reason 23-case regression corpus   |
| 25        | Reproducible AI evaluation artifacts                | Formatter-owned reports plus post-eval format and zero-diff CI gates                             |
| 26        | Managed shared test deployment                      | Managed services/secrets, real WeChat proof, telemetry, calibrated limits and rollback           |
| 27        | Beta hardening and release                          | H5 identity, security review, budgets, accessibility, filing artifacts and staged rollout        |
| 28        | Native App feasibility and device sync              | Retention gate reviewed; HealthKit/Health Connect/Huawei proof of concept                        |

## Release gates

### Internal alpha

- Iterations 1–8 complete.
- Entire non-AI record and planning path works with deterministic fixtures.
- No known critical data-loss or authorization defects.

### Closed beta

- Iterations 9–26 complete.
- AI evaluation set is versioned and safety validators block known high-risk cases.
- Data export and deletion are exercised end to end.
- Support, monitoring, cost limits, rollback, and incident ownership are assigned.

### Public release

- Iteration 27 complete.
- Applicable ICP/APP/Mini Program privacy/AI registration and content-labeling work is reviewed.
- Store materials match actual data practices and product claims.
- Release starts with a small cohort and automatic rollback thresholds.

## Change control

New feature requests enter the risk/backlog section of the next iteration archive. They do not interrupt an active round unless they fix a correctness, security, privacy, or data-loss issue on the current critical path.
