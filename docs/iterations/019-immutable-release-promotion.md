# Iteration 019 — Immutable OCI release promotion

Date: 2026-07-19

State: implementation and local acceptance complete; the implementing main CI and `v0.1.0-rc.1` publication are post-commit exit evidence and must both be green before managed deployment begins

## 1. Scope and success standard

The product goal remains a privacy-first WeChat Mini Program and H5 fitness record/planning service that can be deployed, observed and rolled back without weakening health-data custody. Iteration 018 removed hidden test dependencies and its hosted run `29681631245` passed quality in 3m53s, deployment smoke in 2m14s and the whole workflow in 6m12s. The next critical-path defect is release identity: three independent image jobs produced digests, but no strict combined record prevented a deployer from mixing commits or using mutable tags.

This round implements and exercises a provider-neutral promotion control plane. It does not create managed services, inject real credentials, configure DNS/TLS, open traffic or claim a shared environment. Acceptance requires a versioned strict manifest; negative tests for mixed/tampered/mutable inputs; real-file CLI proof; tag/ref validation; three-fragment workflow aggregation; Node-24 artifact actions; per-image provenance; checksum, workflow artifact and non-overwritable GitHub Release assets; local source/workflow/full regression; one ADR, one archive, one Conventional Commit, a normal push, a green main CI, then the first `v0.1.0-rc.1` remote publication.

Rollback point: before tagging, revert the tool and workflow together. After a tag is published, never move the tag or overwrite its release assets; correct a failure with a new commit and prerelease tag. Application rollback consumes the previous complete manifest and preserves migrations, durable jobs and erasure ledgers.

## 2. Structure, technology and design state

New and changed boundaries:

- `scripts/release-manifest.mjs`: dependency-free Node 24 fragment creation, three-service aggregation and offline manifest verification.
- `scripts/release-manifest.test.ts`: eight positive/negative tests including real temporary files through the same CLI commands used by GitHub Actions.
- `vitest.config.ts`: root release-tool tests join the hermetic unit gate.
- `.github/workflows/publish-images.yml`: SemVer tag/ref qualification, API/Admin/AI digest fragments, Node-24 `upload-artifact@v7` and `download-artifact@v8`, combined record, checksum, summary and GitHub Release publication.
- `package.json`: `pnpm release:verify -- --file ...` exposes offline acceptance to operators.
- ADR-0019, deployment runbook, project status, roadmap, risk register and README describe the promotion and rollback contract.

The release JSON schemas are `myfitness-release-fragment/v1` and `myfitness-release/v1`. The combined record includes only version, source repository/revision, workflow run/attempt, publication time and exact image/digest/reference triples. It contains no credentials, endpoints, user data, cloud identity or mutable tag as a deployment reference. No product API, database, AI behavior or visual design changed in this round.

## 3. Implementation method

### Strict data before workflow glue

The manifest library was implemented without a YAML-specific shortcut so the same invariant set runs locally, in CI and during deployment review. Exact-key validation rejects schema drift. Service names and expected `ghcr.io/<owner>/myfitness-{api,admin,ai}` paths are closed sets. Versions must be `v`-prefixed SemVer, revisions lowercase full Git SHAs, digests lowercase SHA-256, run identities positive and timestamps canonical UTC.

Aggregation accepts exactly three fragments and compares their release context before producing output. The final `reference` is recomputed and revalidated as `image@digest`; an attacker or transcription error cannot change only the digest-qualified reference while leaving the component fields untouched. Expected repository, revision and version options bind an externally downloaded record to a change ticket.

### Promotion after source qualification

The release workflow still builds linux/amd64 and linux/arm64 images with OCI labels and provenance. A tag push is the normal trigger. Manual dispatch fails unless the operator selects the same existing tag as both workflow ref and input. Each matrix job uploads one short-lived fragment. The dependent job downloads only those fragment artifacts, verifies and checksums the aggregate, retains it for 90 days and creates a public repository release record. It refuses to replace an existing release, so a successful tag cannot silently acquire a new digest set.

The first candidate is deliberately a prerelease. The implementing commit must reach `main` and its complete CI must pass before `v0.1.0-rc.1` is created and pushed. The remote workflow, release assets, per-image attestations and registry pull result are exit evidence, not facts inferred from local workflow syntax.

## 4. Validation evidence

- Targeted manifest suite passed 1 file / 8 tests. It covers successful three-image aggregation, expected-value binding, service/image mismatch, mixed commits, duplicate/missing services, rewritten references, mutable versions, unknown fields, noncanonical timestamps and actual fragment/assemble file commands with cleanup.
- Node parsed `scripts/release-manifest.mjs` successfully and targeted Prettier checks passed.
- actionlint 1.7.12 accepted both GitHub Actions workflows, including expressions and embedded Bash/ShellCheck analysis.
- Official current artifact actions were checked before selection: `upload-artifact@v7` and `download-artifact@v8` use the Node 24 generation; download v8 fails artifact digest mismatch by default.
- Repository format and workspace type checks passed. The production audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain findings.
- The hermetic unit gate passed 33 files / 111 tests with local services absent; this adds the eight release-control cases to the prior 103 product/operations cases.
- AI worker tests passed 7/7, weekly-plan explanation evaluation 7/7 and food-photo evaluation 8/8. Fixture providers were used and no paid provider call occurred.
- Contracts, domain, API, administrator and H5 production builds passed. The independent WeApp build passed with the unchanged registered Taro bundle and cache warnings.
- All 15 checksum migrations applied/verified and the integration gate passed 11 files / 42 tests.
- `backup-restore-erasure-v2` restored migration 15, found one ledger entry, recreated one identity suppression, erased one restored user and ended with zero restored users, completed receipt and `ledger_published` backup disposition.
- Playwright passed 21/21 product, privacy and administrator flows. Because no visual design changed, the generated screenshot and evaluation formatting churn was restored to the reviewed baseline before commit.
- The complete three-image deployment smoke passed. A transient local Docker Desktop extraction snapshot miss occurred after the administrator image exported; the existing bounded retry reused the build and succeeded. Migration-before-traffic, API liveness/correlation, PostgreSQL+Redis+object readiness, AI health and administrator security headers all passed, after which every smoke container, network and volume was removed.
- Remote main CI, candidate release URL, three actual digests, release checksum and pull/provenance result are recorded in the handoff after the implementing commit/tag. Local placeholders are never written into this archive as if they were remote proof.

## 5. Problems found and experience captured

- Provenance for three individual images does not answer “which three images form this release.” Artifact identity needs both per-object proof and an aggregate set boundary.
- A full commit SHA tag is still a mutable registry tag. It is useful discovery metadata, but only the registry digest is a deployment identity.
- A matrix job cannot safely communicate an unordered set through hand-copied logs. Small typed artifacts plus a dependent fail-closed aggregator preserve parallel builds and deterministic promotion.
- A release rerun that overwrites assets would make the same Git tag mean different bytes. Operational convenience must not weaken tag immutability; failed promotion advances to a new prerelease tag.
- Workflow syntax passing is necessary but remote registry/package permissions, attestations and GitHub Release creation only become evidence after the real tag run.
- A local container-engine content-store snapshot can fail after a valid image export. A bounded retry is appropriate because it preserves the identical build result and permanent failures still exhaust; deleting caches or weakening image checks would lose evidence.
- Release records are non-secret but operationally sensitive. They should be copied into the managed platform's protected change record because Actions retention and repository administration are not independent backup domains.

## 6. Global state review, remaining risks and next step

Product recording, planning, AI/photo review, privacy/export/erasure and administrator evidence remain locally complete for the present MVP stage. Source CI and disposable image topology are hosted-green. Release promotion is locally implemented and becomes complete only when the candidate workflow publishes one coherent digest set and the manifest verifies from downloaded release assets.

Still open for actual online service: cloud entity/account/region/budget and change authority; managed PostgreSQL/Redis/object storage/KMS with backup/restore and independent ledger custody; domain/TLS/WAF/proxy topology; real WeChat AppID/secret/request-domain/device proof; administrator OIDC tenant and access owner; H5 identity; centralized metrics/logs/alerts/on-call; calibrated rate/capacity limits; approved AI provider policy/canary; food catalog licensing; privacy/filing review; accessibility and bundle budgets.

After candidate publication, iteration 020 provisions the repeatable managed shared test environment. Its smallest first step is an owner-approved provider/region/account decision and an environment inventory that maps each required secret, network boundary, data store, retention owner and immutable image reference. No repository change may invent those external authorities.

## 7. References

- [Hosted CI run 29681631245](https://github.com/Zach424/MyFitness/actions/runs/29681631245)
- [ADR-0019](../architecture/decisions/0019-immutable-release-promotion.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
- [GitHub workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases)
- [actions/download-artifact releases](https://github.com/actions/download-artifact/releases)
