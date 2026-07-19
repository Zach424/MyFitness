# Iteration 020 — Managed environment admission

Date: 2026-07-19

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while real cloud/account/domain/identity approvals remain intentionally external

## 1. Scope and success standard

MyFitness remains a privacy-first WeChat Mini Program and responsive H5 fitness record, planning and review product. Iteration 019's main CI `29683884266` passed, tag workflow `29684193291` published `v0.1.0-rc.1`, and the downloaded release checksum, three public multi-architecture GHCR indices and attestation manifests were verified. The next critical-path gap is no longer artifact identity: the environment inputs needed before those artifacts receive credentials or traffic were prose only.

This round implements one provider-neutral deployment-admission boundary. Acceptance requires a strict non-secret environment schema; exact cloud/change/domain/secret-reference/data-custody/telemetry/AI ownership fields; canonical public-origin validation; placeholder and raw-value rejection; the real release checksum and existing manifest verifier; first-deployment and previous-release rollback modes; deterministic ordered output; tests through real files; full project regression; one ADR, one archive and exactly one Conventional Commit.

It does not create a cloud account, spend a budget, provision managed services, issue certificates, store credentials, configure WeChat/OIDC, contact an AI provider or open public traffic. Synthetic acceptance references prove code behavior only and are deleted after the check. Rollback for this code round is one revert before external use; accepted deployment records become immutable change evidence.

## 2. Structure, technology and design state

New and changed boundaries:

- `scripts/deployment-admission.mjs`: dependency-free Node 24 validator and admission-record generator.
- `scripts/deployment-admission.test.ts`: eleven positive and negative cases, including the real-file CLI, deliberate template rejection and canonical output ordering.
- `infra/deploy/managed-environment.example.json`: complete shape with intentional placeholders and a zero budget; it is documentation, not deployable configuration.
- `package.json`: `pnpm deploy:admit -- ...` exposes the same gate to operators and future deployment automation.
- ADR-0020, deployment runbook, project status, roadmap, risk register and README define the environment/change boundary.

The schemas are `myfitness-managed-environment/v1` and `myfitness-deployment-admission/v1`. The environment record contains logical references and public origins only. It cannot contain unknown properties or secret values through the typed fields. The output retains the validated environment, immutable release identity, expected runtime posture, seven deployment actions and one explicit rollback mode. No product API, database schema, AI behavior, client flow or visual design changed.

## 3. Implementation method

### Authority references instead of invented values

The schema assigns a required URI-like scheme to every external control: `change://` for change authority, `account://` for the cloud account, `secret://` for secret-manager bundles, `service://` for managed services, `owner://` for people/teams and `evidence://` for policy or test evidence. Placeholder words, whitespace and unsupported fields fail. These identifiers are deliberately not dereferenced locally; the protected external change system owns approval and access.

API, H5 and administrator origins must be distinct canonical HTTPS origins with routable domain names. Credentials, ports, paths, queries, fragments, IP literals, localhost and test/internal suffixes are rejected. The record also fixes the intended proxy-hop count so production runtime preflight and the deployed edge can be compared later.

### Release and rollback before credentials

The CLI hashes the exact downloaded release bytes and validates the standard `sha256sum` line before calling the iteration-019 manifest validator. The admitted record therefore cannot switch to a tag, another repository or a hand-copied digest. Migration uses the same API digest as traffic, AI remains private, API starts without traffic, administrator remains behind OIDC, operational/custody proof precedes a bounded canary.

The first shared-test environment has no older deployed application, so its safe rollback is explicit withdrawal of traffic and application scale-to-zero; managed data and forward migrations remain. Production cannot use this shortcut and must name a distinct earlier manifest whose publication time precedes the target.

## 4. Validation evidence

- Node syntax validation passed for the new dependency-free CLI.
- Targeted admission tests passed 1 file / 11 tests. They cover complete shared-test admission, real-file CLI/checksum/output, placeholder and raw-secret rejection, unknown keys, the committed non-admissible template, canonical secret-reference ordering, local/path/shared origin rejection, checksum tampering, shared-test-only no-traffic rollback, older complete production rollback, same-source/future rollback rejection, timestamps and unsupported modes.
- The complete hermetic unit gate passed 34 files / 122 tests with no PostgreSQL, Redis or object storage dependency.
- The actual downloaded `v0.1.0-rc.1` manifest and SHA-256 file produced an admission record under a clearly synthetic, temporary environment fixture. The output bound revision `1f818591ca2a925f884b14cdc663dd4974967581`, manifest digest `sha256:7fe66b589338a2fc4beeface80bc53a5fa8449059fe1f74b91fb342749b07425` and the published API/Admin/AI digests to seven ordered steps and `no-traffic` rollback.
- The same real release plus committed example failed with `deployment changeAuthorityRef must not contain a placeholder`, returned exit code 1 and wrote no output. Temporary synthetic input/output files were removed through the patch workflow.
- Repository formatting and whitespace checks passed. The production audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain advisories. Contracts/domain builds plus the complete workspace type check passed.
- AI Worker tests passed 7/7, plan-explanation evaluation 7/7 and food-photo evaluation 8/8 using fixture providers; no paid model call occurred.
- API, administrator, H5 and WeApp production builds passed. H5 remained a 305 KiB entry with 527–598 KiB large route chunks; WeApp vendor remained 417 KiB. The registered Taro dynamic-import, bundle and cache serialization warnings did not change.
- All 15 checksum migrations applied/verified. The integration gate passed 11 files / 42 tests.
- `backup-restore-erasure-v2` restored migration 15, replayed one ledger entry, recreated one provider-identity suppression, erased the one restored deleted user and ended with zero restored users, a completed receipt and `ledger_published` backup disposition.
- Playwright passed 21/21 administrator, nutrition/photo, onboarding, plan/AI, privacy, body, Today and workout flows. Because this round changed no UI or evaluation data, 18 test-regenerated JSON/PNG files were verified as the only generated changes and restored to their reviewed `HEAD` bytes.
- The complete three-image deployment smoke passed without retry: pinned AI/API/administrator images and attestations built, the one-shot migration completed before traffic, all dependencies and application images became healthy, and the black-box verifier returned `api-liveness-and-correlation`, `api-postgres-redis-object-readiness`, `ai-worker-health` and `administrator-html-and-security-headers` as checked. Every smoke container, network and volume was removed.
- Remote main CI is recorded after the implementing commit rather than predicted here.

## 5. Problems found and experience captured

- An immutable release answers “what bytes” but not “who authorized which environment.” Release promotion and environment admission are separate control-plane objects.
- A production `.env` example mixes public topology and private values and cannot represent ownership, backups, retention or alert responsibility. A non-secret inventory belongs before secret injection.
- A field named `secretRef` is safer than a loosely typed string but cannot prove the reference exists or was approved. Structural admission must remain inside a protected change workflow; local success is not external authority.
- Generic checklists drift because missing rows are invisible. Exact-key schemas turn omission and accidental new controls into reviewable failures.
- First deployment has no previous application image. Pretending it does encourages fake rollback evidence; explicit no-traffic rollback for shared test is more truthful and keeps data forward-only.
- Synthetic success fixtures are useful for tool validation but dangerous as persistent environment artifacts. Keep only a deliberately failing template in source control and remove generated acceptance records.
- The three-image service release does not identify H5 or WeApp bytes. A shared environment can prepare domains and identities, but managed client delivery must wait for deterministic client bundles and source-bound checksums rather than rebuilding mutable source during deployment.

## 6. Global state review, remaining risks and next step

The recording/planning/AI/photo/privacy/administrator application slices remain unchanged and locally reproducible. Source CI, disposable topology, immutable candidate publication and digest pulls are now proven. Deployment admission is structurally executable, but no real managed environment is admitted because account, region, budget, domains, credential references, service owners and evidence records have not been supplied by their actual owners.

Still open: package and identify H5/WeApp delivery artifacts; provision managed PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; load secret-manager bundles; exercise real WeChat device/domain login and erasure; select and test administrator OIDC; centralize telemetry and alerts with a named responder; calibrate capacity/rates; approve an AI provider canary; run migration, black-box, privacy, restore and rollback proof in the shared environment.

The next controlled step is iteration 021: turn the reviewed H5 and WeApp production roots into deterministic, checksummed, source-bound client release artifacts and require them alongside the existing service manifest before client delivery. Iteration 022 then creates the real protected environment dossier from owner-approved account/region/budget and references, provisions managed resources, runs admission, deploys without general traffic, and exercises identity, custody, telemetry, canary and no-traffic rollback. Repository work must not substitute synthetic references for external decisions.

## 7. References

- [Candidate release v0.1.0-rc.1](https://github.com/Zach424/MyFitness/releases/tag/v0.1.0-rc.1)
- [Main CI run 29683884266](https://github.com/Zach424/MyFitness/actions/runs/29683884266)
- [Publish run 29684193291](https://github.com/Zach424/MyFitness/actions/runs/29684193291)
- [ADR-0019](../architecture/decisions/0019-immutable-release-promotion.md)
- [ADR-0020](../architecture/decisions/0020-managed-environment-admission.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
