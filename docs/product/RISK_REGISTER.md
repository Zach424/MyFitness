# Product risk register

Last reviewed: 2026-07-19, iteration 011

This register tracks release-affecting uncertainty. A mitigation is evidence to collect, not a claim that the risk is gone.

| ID    | Risk                                                                          | Level  | Current control / next gate                                                                                  |
| ----- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| R-001 | GitHub transport is unavailable in the execution environment                  | High   | Preserve signed-off local commits; later authenticated fetch/replay/push without force                       |
| R-002 | Development identity is not production authentication                         | High   | Dev issuer is production-disabled; add verified WeChat/phone identity before shared test                     |
| R-003 | Primary-store export/erasure works, but backup/provider deletion is unproven  | High   | Freeze the production data map and exercise backup, log and provider retention/deletion evidence             |
| R-004 | Real food-photo quality, latency, cost and provider data controls are unknown | High   | Fixture remains default; require owner-approved canary, legal/region/retention review and thresholds         |
| R-005 | Local private disk is not safe for horizontal production replicas             | High   | Replace with encrypted private object storage, lifecycle rules and durable reconciliation                    |
| R-006 | Starter food composition is demonstration data                                | High   | Select licensed/localized versioned catalog and attribution before beta                                      |
| R-007 | Fifteen offline AI cases are insufficient safety evidence                     | High   | Add expert-reviewed real images, obfuscation, injection, refusal and regression thresholds                   |
| R-008 | API lacks production rate limits, request tracing, metrics and alerts         | High   | Add abuse limits, correlation, dashboards, alert ownership and incident rollback before beta                 |
| R-009 | H5 and WeApp bundles exceed recommended warnings                              | Medium | Establish budgets and split large route/vendor chunks before beta                                            |
| R-010 | Food-photo estimates may still be trusted too readily                         | High   | Keep ranges/source/PROOF treatment, user edits, no auto-write; validate with target users and experts        |
| R-011 | Consent/events exist without complete policy/filing review                    | High   | Align actual retention/provider behavior with privacy text and applicable China release requirements         |
| R-012 | Git/DB/filesystem and provider calls cross transaction boundaries             | Medium | User-scoped media purge reduces erasure residue; add durable jobs/reconciliation and fault injection         |
| R-013 | Synchronous JSON export can exceed API memory or Mini Program 50 MiB limits   | Medium | Measure closed-beta account sizes; move to encrypted expiring archive jobs before the threshold is reachable |

Resolved implementation defects remain documented in their iteration archive rather than removed from history. Product-level risks close only when the named release evidence exists.
