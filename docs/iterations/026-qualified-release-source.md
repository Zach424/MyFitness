# Iteration 026 – Qualified release source provenance

Date: 2026-07-20

State: implementation and local acceptance complete; the implementing main CI is post-commit evidence, while a new candidate and managed shared deployment remain gated on owner-controlled inputs

## 1. Scope and success standard

The release workflow already bound OCI and client artifacts to one tag, revision and workflow attempt, but its requirement that the tagged commit have a green `main` CI was documentation only. The critical-path defect was upstream of every artifact: the workflow did not independently prove that the remote tag resolved to `GITHUB_SHA`, that the commit remained in current `main`, or that `.github/workflows/ci.yml` had succeeded for that exact SHA as a `main` push.

This round requires a read-only hosted qualification before image registry login or client packaging. Annotated and lightweight tags must resolve to the workflow commit; the commit must be current or ancestral `main`; an exact successful `main` push CI run must exist; and a strict record must bind those facts to the release workflow and be rechecked before it becomes an immutable GitHub Release asset. Mismatch, divergence, absent/failed/wrong-event CI or record tampering must fail closed. Offline tests and a read-only historical GitHub exercise are required.

The round does not create or move a tag, publish a Release, push an image, set a repository variable, load a cloud credential, provision infrastructure or open traffic. It does not change runtime product behavior, health contracts, UI, AI safety policy, database schema or client bundles. Managed shared deployment moves to iteration 027 because the required approved API address, account, region, budget, domain and protected credential/evidence references remain external.

## 2. Structure, technology and design state

Changed boundaries:

- `scripts/release-qualification.mjs` owns hosted lookup, strict `myfitness-release-qualification/v1` validation, JSON emission and offline recheck.
- `scripts/release-qualification.test.ts` covers tag forms, branch ancestry, exact CI selection, tamper rejection, CLI round-trip and workflow ordering.
- `.github/workflows/publish-images.yml` grants only `actions: read` plus `contents: read` to qualification, blocks both publication branches behind it and retains the record in the workflow artifact and GitHub Release.
- ADR-0025 records the control-plane decision; status, roadmap, risk, architecture, deployment runbook and README describe the new boundary.

The implementation is dependency-free Node.js ESM and reuses the existing SemVer validator. It calls GitHub REST with the workflow token, API media type and pinned API version. No package or lockfile changes were needed. Product technology remains Taro 4 + React + strict TypeScript, NestJS 11, PostgreSQL 18, Redis, private S3-compatible storage, Next.js 16 and FastAPI. No visual surface or design token changed, so the existing 23 reviewed screenshots remain the visual baseline.

## 3. Implementation method

### Resolve the hosted release identity before publication

The qualifier first validates the repository, 40-character lowercase revision, `v`-prefixed SemVer, exact tag ref, default branch, CI workflow and release run identity. It reads the repository default branch, resolves the remote tag through at most five annotated-tag layers and requires the final object to be the workflow commit. It then compares `<revision>...main` and accepts only `ahead` or `identical` with that revision as the exact merge base.

The Actions query filters by `main`, `push`, successful status and exact `head_sha`. Returned entries are independently checked for the expected workflow path, completed/success result and exact branch/event/SHA before the latest attempt is selected. Network errors expose only HTTP status; the token is neither serialized nor logged.

### Make the proof portable and self-checking

The strict record repeats the release revision inside both the tag target and CI head, then validates both equalities. It also binds the release workflow run/attempt so an artifact copied from another attempt is rejected. Unknown fields, malformed URLs, wrong workflow paths and a release run substituted as CI evidence fail.

The release-record job downloads and checks the record again without network access, before service/client manifest assembly. It stores the exact JSON in the 90-day workflow bundle and in the final non-overwritable GitHub Release. Both image publication and client packaging depend on qualification, placing the gate before Docker login, image push and client compilation.

## 4. Validation evidence

- The focused release/deployment boundary passed 4 files / 37 tests, covering the new qualifier plus release manifest, client release and managed-admission compatibility.
- Repository formatting passed with the pinned Prettier configuration; strict TypeScript checks passed for every workspace package and application.
- Full Vitest passed 37 files / 152 tests.
- A read-only call against the existing immutable `v0.1.0-rc.1` resolved its annotated tag to commit `1f818591ca2a925f884b14cdc663dd4974967581`, proved that commit is an ancestor of current `main`, and selected successful `main` push CI run `29683884266` for the exact same SHA and `.github/workflows/ci.yml`.
- Static workflow acceptance proved qualification appears before `docker/login-action`, both publication paths require it, `actions: read` is present, the record is rechecked and the exact file is a final Release asset.
- The real GitHub exercise was read-only. No tag, Release, package, repository variable, secret, cloud resource or traffic state changed.
- The implementing hosted quality and deployment-smoke jobs remain post-commit evidence rather than a prediction. This round changes no runtime/container/browser surface, so local integration, E2E and screenshots were not rerun.

## 5. Problems found and experience captured

- A manifest can be internally immutable and still start from an unqualified source. Repository state and CI identity must be proven before expensive or irreversible publication.
- `GITHUB_SHA` proves the checkout selected by Actions, not by itself the current remote tag target or default-branch relation.
- Workflow name alone is weak CI evidence. Exact SHA, branch, event, path, status and conclusion form one release assertion.
- Qualification after image push is too late; dependency ordering is a safety property and deserves a static regression test.
- An online check alone is ephemeral. A strict, self-bound JSON record makes the decision reviewable later, while its offline checker prevents cross-run substitution.
- The record is not owner approval or infrastructure proof. Keeping release provenance separate from managed-environment admission avoids inventing cloud authority.
- The local Git 2.37 HTTPS stack remains unreliable through the active virtual-address proxy. A parent-checked, exact-SHA, non-force Git Data API fast-forward remains an auditable transport fallback; it does not weaken repository history rules.

## 6. Global state review, remaining risks and next step

Release promotion now has three explicit planes: source qualification, immutable service/client artifacts and managed-environment admission. The source gate is locally complete and historically exercised, but no new candidate has consumed it yet. R-022 remains Medium because managed infrastructure, canary deployment and rollback are still unproven. R-024 remains Medium because `v0.1.0-rc.1` has no client assets and the approved client API URL is absent. R-023 remains High because local or hosted structural proof cannot dereference owner approvals in a protected change system.

Still open: approve the client API address and publish a client-bearing candidate; provide the China-region account, budget, domain, WeChat/OIDC and evidence references; provision PostgreSQL/Redis/object storage/KMS and independent erasure-ledger custody; configure DNS/TLS/WAF/proxy topology; exercise device identity, deletion, restore, telemetry, capacity, canary and no-traffic rollback; select H5 production identity; broaden expert AI safety evidence; and approve a real-provider canary.

The next controlled step is iteration 027: use owner-provided inputs to publish and independently verify a new immutable service/client candidate, create the protected managed-environment dossier, run admission, deploy with no general traffic, upload the exact WeApp TAR to private preview and exercise identity, custody, telemetry and rollback. Iteration 028 owns H5 production identity and beta hardening; iteration 029 remains the native/device feasibility gate after retention evidence.

## 7. References

- [Iteration 025 archive](025-reproducible-ai-evaluation-artifacts.md)
- [ADR-0019: immutable release promotion](../architecture/decisions/0019-immutable-release-promotion.md)
- [ADR-0021: immutable client delivery artifacts](../architecture/decisions/0021-immutable-client-delivery-artifacts.md)
- [ADR-0025: qualified release source](../architecture/decisions/0025-qualified-main-ci-release-promotion.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
- [Delivery roadmap](../product/ROADMAP.md)
