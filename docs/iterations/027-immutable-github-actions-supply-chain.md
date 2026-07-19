# Iteration 027 – Immutable GitHub Actions supply chain

Date: 2026-07-20

State: implementation and local acceptance complete; repository SHA-policy enforcement and the implementing hosted CI are post-commit evidence, while managed deployment remains gated on owner-controlled infrastructure and identity inputs

## 1. Scope and success standard

Iteration 026 made release-source identity executable, but both workflows still executed external actions through movable major tags. That gap sits before every repository-owned validator and is most serious in the publication jobs that receive GHCR write access, OIDC identity, provenance authority and GitHub Release write access.

This round requires all 27 external `uses:` sites across both workflows to resolve to reviewed full 40-character commits. One strict lock must bind the 12 unique actions to exact upstream version tags; an offline regression gate must reject tags, branches, abbreviated/unknown/mislabelled SHAs and stale lock entries; weekly GitHub Actions Dependabot updates must remain visible; and the repository Actions policy must require full-SHA pins after the commit reaches `main`. Targeted and full tests plus the exact implementing hosted CI are required.

The round does not change application runtime, API contracts, health data, AI behavior, database schema, container contents, client identity or visual design. It does not create a candidate tag/Release, publish an image, configure a client API address, provision a cloud service, add a credential or open traffic. Managed shared deployment moves to iteration 028 because the account, region, budget, domain and protected WeChat/OIDC/evidence references remain owner-controlled.

## 2. Structure, technology and design state

Changed boundaries:

- `.github/workflows/ci.yml` and `publish-images.yml` replace all external major tags with reviewed commit SHAs while retaining exact SemVer comments.
- `infra/ci/github-actions.lock.json` records a sorted `myfitness-github-actions-lock/v1` source-of-truth for 12 actions.
- `scripts/github-actions-lock.test.ts` validates the lock and every current/future workflow `uses:` site offline.
- `.github/dependabot.yml` enables weekly `github-actions` update proposals from repository root.
- The release-qualification ordering test now locates the Docker login action independently of its ref syntax; the new lock test owns immutability.
- ADR-0026 records the supply-chain decision; architecture, status, roadmap, risk, deployment guidance and README expose the control.

No package, pnpm lockfile or application dependency changes are required. The implementation uses existing Vitest, Node.js filesystem APIs, YAML comments and GitHub-native Dependabot. Product technology remains Taro 4 + React + strict TypeScript, NestJS 11, Next.js 16, PostgreSQL 18, Redis, private S3-compatible storage and FastAPI. No UI, token or layout changed, so the existing 23 reviewed screenshots remain authoritative.

## 3. Implementation method

### Resolve pins from the named upstream repositories

For each action, `git ls-remote --tags https://github.com/<owner>/<action>.git` resolved both the currently selected major tag and its matching exact SemVer tag. The peeled commit is used for annotated tags; a lightweight tag uses its direct commit. The 12 resulting revisions, exact version refs and verification date form the committed lock. No marketplace mirror, fork, search-result SHA or abbreviated value is accepted.

Workflow lines use `owner/repository@<40-character-sha> # <exact-semver>`. The comment is not authority—the lock and SHA are—but it preserves review intent and gives Dependabot a version association. Existing job ordering, inputs, permissions and action configuration are unchanged.

### Enforce immutability without network-dependent tests

The regression test discovers all YAML workflows rather than listing two filenames. It validates strict lock keys, ordering, uniqueness, version/ref consistency and revision shape, then parses every active `uses:` line. Relative local actions are allowed; future container actions require a `sha256` digest. Every external action must match one lock entry exactly, and every lock entry must appear in at least one workflow, preventing an unused record from accumulating.

Mutation fixtures prove a movable tag, an unreviewed full SHA and a wrong version comment all fail. A separate check confirms Dependabot monitors `package-ecosystem: github-actions` at `/` weekly. Hosted repository policy is applied only after pinned workflows reach `main`, preventing an enforcement window in which the current default branch cannot run.

## 4. Validation evidence

- Direct upstream tag resolution produced 12 unique full revisions; every selected major ref and exact SemVer ref resolved to the same commit at verification time.
- The focused supply-chain/release boundary passed 2 files / 11 tests after correcting the prior ordering assertion to be ref-agnostic.
- All 27 workflow action uses map to exactly 12 sorted lock entries; no tag, branch, abbreviated SHA or unregistered action remains.
- Full Vitest passed 38 files / 155 tests, and strict TypeScript passed every workspace application/package. Repository formatting passed after the documentation tables were normalized by the pinned formatter.
- The implementing hosted `quality` and `deployment-smoke` jobs plus the repository `sha_pinning_required` readback remain post-commit evidence rather than a prediction.
- No runtime, database, container, browser or screenshot path changed; the hosted pipeline still exercises the full integration, restore, dual-client, browser and deployment-smoke boundary.

## 5. Problems found and experience captured

- Release provenance cannot compensate for mutable code that ran before the provenance record was created.
- Trusted publisher names and version tags improve review context but do not provide immutability; the full commit is the execution identity.
- Pinning only privileged jobs is incomplete because an altered quality action can manufacture the green CI evidence later consumed by release qualification.
- A SHA-only mass replacement is hard to maintain. The exact version comment, lock and Dependabot signal separate execution authority from update discovery.
- Static enforcement should discover workflows and reject stale lock entries so a new file or deleted action cannot silently leave the policy boundary.
- The first targeted run exposed a brittle test that searched the former `@v3` text. Assigning order and immutability to separate assertions made both responsibilities clearer.
- A repository setting is valuable defense in depth, but it is external state. The committed lock/test remains necessary for review, provenance and portability.

## 6. Global state review, remaining risks and next step

Source qualification, service/client artifact identity and workflow dependency identity are now locally deterministic. The remaining managed-deployment blockers are unchanged: approved client API address; China-region account/entity/budget; DNS/TLS/proxy topology; protected WeChat and OIDC references; managed PostgreSQL/Redis/object storage/KMS; independent erasure-ledger custody; telemetry/alert owners; AI provider policy and canary authority.

R-022 remains Medium because no managed service or no-traffic rollback has been exercised. R-023 remains High because repository controls cannot prove external approval references. R-024 remains Medium because the only published candidate predates client and qualification assets. R-026 is added as Medium: pinned actions can age, so Dependabot proposals require timely upstream review, lock synchronization and complete CI rather than automatic merge.

The next controlled step is iteration 028: obtain owner-approved deployment inputs, set the canonical client API URL, publish and independently verify a new source-qualified service/client candidate, create the protected environment dossier, run admission, provision/deploy without general traffic, upload the exact WeApp TAR to private preview and exercise identity, custody, telemetry and no-traffic rollback. Iteration 029 owns H5 production identity and beta hardening; iteration 030 remains the native/device feasibility gate.

## 7. References

- [Iteration 026 archive](026-qualified-release-source.md)
- [ADR-0017: reproducible OCI boundary](../architecture/decisions/0017-reproducible-oci-deployment-boundary.md)
- [ADR-0025: qualified release source](../architecture/decisions/0025-qualified-main-ci-release-promotion.md)
- [ADR-0026: immutable GitHub Actions supply chain](../architecture/decisions/0026-immutable-github-actions-supply-chain.md)
- [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Dependabot action updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
- [Delivery roadmap](../product/ROADMAP.md)
