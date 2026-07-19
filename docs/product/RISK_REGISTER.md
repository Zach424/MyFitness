# Product risk register

Last reviewed: 2026-07-19, iteration 014

This register tracks release-affecting uncertainty. A mitigation is evidence to collect, not a claim that the risk is gone.

| ID    | Risk                                                                          | Level  | Current control / next gate                                                                                                                            |
| ----- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-001 | GitHub transport is unavailable in the execution environment                  | High   | Preserve signed-off local commits; later authenticated fetch/replay/push without force                                                                 |
| R-002 | Development identity is not production authentication                         | High   | Dev issuer is production-disabled; add verified WeChat/phone identity before shared test                                                               |
| R-003 | Primary-store export/erasure works, but backup/provider deletion is unproven  | High   | Freeze the production data map and exercise backup, log and provider retention/deletion evidence                                                       |
| R-004 | Real food-photo quality, latency, cost and provider data controls are unknown | High   | Fixture remains default; require owner-approved canary, legal/region/retention review and thresholds                                                   |
| R-005 | Local private disk is not safe for horizontal production replicas             | High   | Replace with encrypted private object storage, lifecycle rules and durable reconciliation                                                              |
| R-006 | Starter food composition is demonstration data                                | High   | Select licensed/localized versioned catalog and attribution before beta                                                                                |
| R-007 | Fifteen offline AI cases are insufficient safety evidence                     | High   | Add expert-reviewed real images, obfuscation, injection, refusal and regression thresholds                                                             |
| R-008 | Process metrics lack central scraping, alert delivery and named ownership     | High   | Deploy private aggregation, dashboards, paging and exercise the iteration-012 incident runbook before beta                                             |
| R-009 | H5 and WeApp bundles exceed recommended warnings                              | Medium | Establish budgets and split large route/vendor chunks before beta                                                                                      |
| R-010 | Food-photo estimates may still be trusted too readily                         | High   | Keep ranges/source/PROOF treatment, user edits, no auto-write; validate with target users and experts                                                  |
| R-011 | Consent/events exist without complete policy/filing review                    | High   | Align actual retention/provider behavior with privacy text and applicable China release requirements                                                   |
| R-012 | Git/DB/filesystem and provider calls cross transaction boundaries             | Medium | User-scoped media purge reduces erasure residue; add durable jobs/reconciliation and fault injection                                                   |
| R-013 | Synchronous JSON export can exceed API memory or Mini Program 50 MiB limits   | Medium | Measure closed-beta account sizes; move to encrypted expiring archive jobs before the threshold is reachable                                           |
| R-014 | Fixed-window limits and proxy-hop trust are not traffic/topology calibrated   | Medium | Load-test boundaries and verify exact `TRUST_PROXY_HOPS` in the shared environment before opening traffic                                              |
| R-015 | Production audit retains 6 moderate Taro build/development-chain advisories   | Medium | Critical/high are zero; remove esbuild/webpack-dev-server/uuid findings through a supported Taro upgrade and rerun full graph/dual-client/E2E evidence |
| R-016 | Enterprise operator identity and access governance are not configured         | High   | Select OIDC tenant/client and named owner; exercise dual-reviewed provisioning, recertification, disablement, revocation and shared login before use   |
| R-017 | Administrator audit is immutable only inside the primary database             | High   | Define retention and owner; export to independently protected storage, include restore evidence and alert on write/access anomalies before real access |

Resolved implementation defects remain documented in their iteration archive rather than removed from history. Product-level risks close only when the named release evidence exists.
