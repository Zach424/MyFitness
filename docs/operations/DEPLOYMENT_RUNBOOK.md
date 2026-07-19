# Deployment and image runbook

Status: OCI packaging, hosted CI and service-only `v0.1.0-rc.1` publication are green; immutable workflow dependencies, exact tag/main/CI source qualification, deterministic client packaging and combined service/client admission are locally accepted while the next candidate, real shared infrastructure, external approvals and public traffic remain unconfigured

## Source and lifecycle qualification

Before image acceptance, stop local MyFitness dependencies and run `pnpm test`. The current 38-file/155-test unit gate must pass without PostgreSQL, Redis or MinIO. OpenAPI tests and generation use the explicit API `metadata` startup mode, which assembles the shipped application graph and HTTP policy but does not run background jobs or verify external dependencies.

Production, integration, restore, E2E and deployment processes use the default `runtime` mode. It retains object-storage startup verification, photo-expiry reconciliation and durable data-operation workers. Do not select metadata mode for a traffic-serving process, and do not treat its successful initialization as readiness evidence; `/v1/health` and the black-box deployment verifier own that proof.

The hosted source gate must complete before `deployment-smoke` starts. A skipped smoke after a source failure is expected fail-closed behavior, not image evidence.

## Workflow dependency qualification

Every external `uses:` in `.github/workflows` must select the full commit recorded in `infra/ci/github-actions.lock.json` and retain its exact SemVer comment. Repository-local actions may use `./`; a future container action must use a `sha256` digest. The repository Actions setting `sha_pinning_required` must remain enabled. A branch, tag, abbreviated SHA or unregistered revision is not an acceptable emergency workaround.

Run the offline gate after any workflow or action update:

```bash
pnpm exec vitest run scripts/github-actions-lock.test.ts
```

Dependabot checks the `github-actions` ecosystem weekly, but its pull request is only an update signal. Resolve both the proposed exact tag and corresponding major tag from `https://github.com/<owner>/<action>.git`, require the same peeled commit, review upstream source/release notes, then update every workflow use, version comment and lock entry together. Require full local validation and the implementing hosted `quality` plus `deployment-smoke` run before merge. Do not auto-merge an action update or edit only the comment/lock.

## Artifact acceptance

Run from the repository root:

```bash
pnpm deploy:smoke
```

The command builds AI, API and administrator images in sequence, starts pinned disposable dependencies, runs the database migration task, waits for image health checks, executes the external verifier, then removes every container and volume. Default host ports are API `13100`, administrator `13101` and AI `18001`. Override verifier endpoints with `MYFITNESS_DEPLOY_API_URL`, `MYFITNESS_DEPLOY_ADMIN_URL` and `MYFITNESS_DEPLOY_AI_URL` when checking a shared environment.

The committed smoke credentials, development identity adapter, fixture AI and HTTP MinIO endpoint are test-only. Do not expose this Compose project to another host or reuse its volumes.

## Production configuration preflight

1. Copy `infra/deploy/production.env.example` into the approved secrets workflow. Its placeholder values are deliberately not deployable.
2. Replace every credential/domain/region value through the platform secret manager; do not create a populated repository file or CI artifact.
3. Run the API image without network side effects:

```bash
docker run --rm --env-file production.env \
  ghcr.io/zach424/myfitness-api:sha-<full-commit> \
  node dist/scripts/verify-production-config.js
```

4. Require `status: ok`, WeChat-only auth, `0.0.0.0` bind, encrypted object storage, disabled bucket auto-creation, the expected proxy hop count and TLS-backed external endpoints. Output is intentionally redacted to modes/protocols.
5. Validate administrator OIDC URLs/client/redirect, secure cookies and the internal API URL separately. Local operator login must remain false.

## Publish and identify images

GitHub Actions publishes `myfitness-api`, `myfitness-admin` and `myfitness-ai` to GHCR and packages the H5/WeApp clients from an existing `v`-prefixed SemVer tag. Before registry login or client build, the qualification job resolves the remote tag to the exact workflow commit, proves that commit is current or ancestral `main`, and selects a completed successful `main` push run of `.github/workflows/ci.yml` with the same `head_sha`. Missing, failed or mismatched evidence stops both publication paths. Before creating the tag, set the repository variable `MYFITNESS_CLIENT_API_BASE_URL` to the approved canonical external `https://<host>/v1` address. Empty, HTTP, IP, local/test/internal, credential-bearing, port, query and non-`/v1` values fail before any image is published. A manual dispatch must select the tag as the workflow ref and repeat the exact tag in `release_tag`; a branch dispatch fails closed.

The normal candidate sequence is:

```bash
git tag -a v0.1.0-rc.2 -m "MyFitness v0.1.0-rc.2"
git push origin v0.1.0-rc.2
```

Each image job publishes linux/amd64 and linux/arm64, records its registry digest and pushes a provenance attestation. In parallel, Taro builds H5 with its current development identity as `preview-only` and WeApp with WeChat identity as a private-preview `candidate`. The packager sorts paths and emits canonical USTAR with mode `0644`, UID/GID `0`, mtime `0`, no symlinks and an embedded `myfitness-client-build/v1` record. The dependent release job accepts exactly one API, Admin, AI, H5 and WeApp record from the same repository, full source revision, tag and workflow attempt. It publishes these GitHub Release assets:

- `release-qualification.json`: `myfitness-release-qualification/v1` with remote tag resolution, current-main relation and exact CI identity;
- `release-manifest.json`: `myfitness-release/v1` with the three digest-qualified references;
- `release-manifest.sha256`: transport checksum;
- `release-verification.json`: redacted binding summary.
- `client-release-manifest.json`: `myfitness-client-release/v1` with runtime/delivery class plus TAR/tree digests;
- `client-release-manifest.sha256`: client-manifest transport checksum;
- `client-release-verification.json`: service/client source and workflow binding summary;
- `myfitness-client-h5.tar` and `myfitness-client-weapp.tar`: the exact immutable client roots.

Download all nine assets into one directory, then verify transport and semantic bindings before opening a deployment change:

```bash
sha256sum --check release-manifest.sha256
sha256sum --check client-release-manifest.sha256
node scripts/release-qualification.mjs check \
  --file release-qualification.json \
  --repository Zach424/MyFitness \
  --revision <full-40-character-commit> \
  --version <v-prefixed-semver-tag> \
  --tag-ref refs/tags/<v-prefixed-semver-tag> \
  --default-branch main \
  --ci-workflow ci.yml \
  --current-run-id <release-workflow-run-id> \
  --current-run-attempt <release-workflow-run-attempt>
pnpm release:verify -- \
  --file release-manifest.json \
  --expected-repository Zach424/MyFitness \
  --expected-revision <full-40-character-commit> \
  --expected-version <v-prefixed-semver-tag>
pnpm release:client -- verify \
  --file client-release-manifest.json \
  --artifact-dir . \
  --service-release release-manifest.json \
  --expected-repository Zach424/MyFitness \
  --expected-revision <full-40-character-commit> \
  --expected-version <v-prefixed-semver-tag>
```

Require all three commands to report `status: ok`; the qualification must name the intended tag/revision, current `main`, exact successful push CI and release workflow. Then require exactly three `image@sha256:...` references, H5 `preview-only/dev`, WeApp `candidate/wechat`, and the approved API base. The client verifier hashes the actual TAR bytes, parses canonical headers, checks required entrypoints and embedded metadata, and recomputes the unpacked tree digest. Copy every accepted file into the environment's independently protected change record. Do not deploy version or `sha-*` image tags, rebuild clients during deployment, or replace/move an existing tag/release. `v0.1.0-rc.1` remains valid immutable history but cannot satisfy admission v2 or the new qualification-asset requirement because it predates both. Keep complete previous service and client bundles for rollback and verify that all registry attestations name the same revision.

## Managed environment admission

Copy `infra/deploy/managed-environment.example.json` into the approved external change workflow. Do not edit the repository template into a plausible-looking environment: it deliberately contains placeholders and a zero budget and must fail. Populate only logical references to approved accounts, services, owners, evidence and secret-manager bundles; never place credentials in this JSON, command arguments, CI artifacts or admission output.

For the first shared-test deployment, verify the environment and downloaded candidate bundle before loading any platform credential:

```bash
pnpm deploy:admit -- \
  --environment managed-environment.json \
  --release release-manifest.json \
  --release-checksum release-manifest.sha256 \
  --client-release client-release-manifest.json \
  --client-release-checksum client-release-manifest.sha256 \
  --client-artifact-dir . \
  --rollback-mode no-traffic \
  --evaluated-at 2026-07-19T12:30:00.000Z \
  --output deployment-admission.json
```

`no-traffic` is valid only for a first `shared-test` deployment. It means withdraw public traffic and scale API, administrator and AI application services to zero; it does not delete managed data, reverse migrations or restore a backup. A production admission must instead add `--previous-release`, `--previous-release-checksum`, `--previous-client-release`, `--previous-client-release-checksum`, `--previous-client-artifact-dir` and select `--rollback-mode previous-release`. The previous service/client pair must belong to this repository, share one version/revision/workflow, differ from the target and predate it.

Require `schemaVersion: myfitness-deployment-admission/v2`, `status: admitted`, the expected environment/change reference, both downloaded manifest checksums, exactly seven service actions and four client actions. Admission requires the client API base to equal `<managed apiOrigin>/v1`. The client order re-verifies bytes, holds H5 from public traffic because development identity is production-disabled, uploads only the exact WeApp TAR to private preview, and requires real-device identity/custody evidence before submission. The tool validates reference syntax and completeness but does not contact external change/evidence systems. Local success is not owner approval; retain the environment and both complete release bundles inside the protected change record and obtain platform approval there.

## Deployment order

1. Approve and retain one complete managed-environment dossier in the external change system.
2. Run `pnpm deploy:admit` and require exact target/rollback service and client bindings before loading platform credentials.
3. Confirm managed PostgreSQL/Redis/object storage backups, encryption, network policy, capacity and named owners against the admitted references.
4. Load secrets and run the production configuration preflight; compare origins and `TRUST_PROXY_HOPS` with the admission record.
5. Run one admitted API-image migration job with `node dist/database/migrate.js`; stop on checksum drift or any non-zero exit.
6. Deploy the admitted AI digest privately and verify `/health` without exposing its service token.
7. Deploy the admitted API digest with no public traffic; verify `/v1/health/live`, dependency readiness and private operations evidence.
8. Deploy the admitted administrator digest behind the approved OIDC/edge boundary. Verify CSP, frame denial and a real least-privilege login.
9. Verify request correlation/logs/metrics and exercise record, privacy, erasure and restore controls before shifting a bounded canary cohort.
10. Run `node scripts/verify-deployment.mjs` against the shared endpoints and attach its redacted JSON plus the admission/release records to the protected change.
11. Keep the H5 TAR off public hosting while its manifest says `preview-only`; selecting a production H5 identity requires a new source commit and candidate.
12. Upload the admitted WeApp TAR unchanged to a private developer/experience build, verify a real-device login and privacy/erasure custody, then obtain the explicit submission decision.

## Rollback

Stop the rollout on failed migration, manifest/provenance/client-byte verification, readiness, error/latency threshold, auth boundary, custody check or missing telemetry. Select all three images and both client TARs from one previously accepted service/client pair; never mix versions, rebuild from source, restore the database or delete migration history for an application rollback. Before shifting traffic, confirm the previous API understands the current schema, erasure ledger and outstanding durable jobs. Withdraw H5/WeApp delivery when the matching service plane is withdrawn. After rollback, repeat liveness/readiness/correlation, administrator security headers, metrics/job evidence and deletion/restore checks.

## Inputs still required for a shared environment

| Input                                                      | Required owner/evidence                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| China-region cloud account, entity, budget and environment | Account owner, billing limit and infrastructure change authority                 |
| DNS, TLS and edge/proxy topology                           | Domain owner, certificate renewal, exact `TRUST_PROXY_HOPS`, WAF/rate proof      |
| Managed PostgreSQL and Redis                               | Backup/restore owner, TLS/ACL, alerts, capacity and maintenance policy           |
| Private object storage/KMS                                 | IAM, encryption, lifecycle/versioning/replication and erasure-ledger isolation   |
| WeChat Mini Program                                        | Real AppID/secret, request-domain allow-list and real-device login/erasure proof |
| Administrator OIDC                                         | Tenant/client, provision/disable/recertification owner and audit retention       |
| Telemetry and incident response                            | Private scraping/log destination, paging channel, thresholds and named responder |
| AI provider                                                | Region/retention/legal/cost approval and bounded canary thresholds               |

No shared/public deployment may be described as complete until these owners and evidence are recorded, externally approved and exercised. A syntactically admitted fixture is not a managed deployment.
