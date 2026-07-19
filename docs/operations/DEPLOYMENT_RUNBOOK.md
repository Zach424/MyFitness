# Deployment and image runbook

Status: OCI packaging, hosted CI and `v0.1.0-rc.1` immutable publication are green; managed-environment admission is locally accepted while real shared infrastructure, external approvals and public traffic remain unconfigured

## Source and lifecycle qualification

Before image acceptance, stop local MyFitness dependencies and run `pnpm test`. The current 34-file/122-test unit gate must pass without PostgreSQL, Redis or MinIO. OpenAPI tests and generation use the explicit API `metadata` startup mode, which assembles the shipped application graph and HTTP policy but does not run background jobs or verify external dependencies.

Production, integration, restore, E2E and deployment processes use the default `runtime` mode. It retains object-storage startup verification, photo-expiry reconciliation and durable data-operation workers. Do not select metadata mode for a traffic-serving process, and do not treat its successful initialization as readiness evidence; `/v1/health` and the black-box deployment verifier own that proof.

The hosted source gate must complete before `deployment-smoke` starts. A skipped smoke after a source failure is expected fail-closed behavior, not image evidence.

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

GitHub Actions publishes `myfitness-api`, `myfitness-admin` and `myfitness-ai` to GHCR from an existing `v`-prefixed SemVer tag. Release only after that commit's complete main CI is green. A manual dispatch must select the tag as the workflow ref and repeat the exact tag in `release_tag`; a branch dispatch fails closed.

The normal candidate sequence is:

```bash
git tag -a v0.1.0-rc.1 -m "MyFitness v0.1.0-rc.1"
git push origin v0.1.0-rc.1
```

Each image job publishes linux/amd64 and linux/arm64, records its registry digest and pushes a provenance attestation. The dependent release job accepts exactly one API, Admin and AI fragment from the same repository, full source revision, tag and workflow attempt. It publishes these GitHub Release assets:

- `release-manifest.json`: `myfitness-release/v1` with the three digest-qualified references;
- `release-manifest.sha256`: transport checksum;
- `release-verification.json`: redacted binding summary.

Download all three assets into one directory, then verify transport and semantic bindings before opening a deployment change:

```bash
sha256sum --check release-manifest.sha256
pnpm release:verify -- \
  --file release-manifest.json \
  --expected-repository Zach424/MyFitness \
  --expected-revision <full-40-character-commit> \
  --expected-version <v-prefixed-semver-tag>
```

Require `status: ok`, the intended source revision and exactly three `image@sha256:...` references. Copy the accepted files into the environment's independently protected change record. Do not deploy version or `sha-*` tags; they are discovery metadata. Do not replace or move an existing tag/release. Keep the complete previous verified manifest available for rollback and verify that all registry provenance attestations name the same repository revision.

## Managed environment admission

Copy `infra/deploy/managed-environment.example.json` into the approved external change workflow. Do not edit the repository template into a plausible-looking environment: it deliberately contains placeholders and a zero budget and must fail. Populate only logical references to approved accounts, services, owners, evidence and secret-manager bundles; never place credentials in this JSON, command arguments, CI artifacts or admission output.

For the first shared-test deployment, verify the environment and downloaded candidate bundle before loading any platform credential:

```bash
pnpm deploy:admit -- \
  --environment managed-environment.json \
  --release release-manifest.json \
  --release-checksum release-manifest.sha256 \
  --rollback-mode no-traffic \
  --evaluated-at 2026-07-19T12:30:00.000Z \
  --output deployment-admission.json
```

`no-traffic` is valid only for a first `shared-test` deployment. It means withdraw public traffic and scale API, administrator and AI application services to zero; it does not delete managed data, reverse migrations or restore a backup. A production admission must instead add `--previous-release` and `--previous-release-checksum` and select `--rollback-mode previous-release`. The previous manifest must belong to this repository, have a different version and revision, and predate the target.

Require `schemaVersion: myfitness-deployment-admission/v1`, `status: admitted`, the expected environment/change reference, the downloaded release checksum and exactly seven ordered actions. The tool validates reference syntax and completeness but does not contact the external change/evidence systems. A successful local command is not owner approval; retain the environment, release bundle and output inside the protected change record and obtain the platform approval there.

## Deployment order

1. Approve and retain one complete managed-environment dossier in the external change system.
2. Run `pnpm deploy:admit` and require the exact target/rollback release binding before loading platform credentials.
3. Confirm managed PostgreSQL/Redis/object storage backups, encryption, network policy, capacity and named owners against the admitted references.
4. Load secrets and run the production configuration preflight; compare origins and `TRUST_PROXY_HOPS` with the admission record.
5. Run one admitted API-image migration job with `node dist/database/migrate.js`; stop on checksum drift or any non-zero exit.
6. Deploy the admitted AI digest privately and verify `/health` without exposing its service token.
7. Deploy the admitted API digest with no public traffic; verify `/v1/health/live`, dependency readiness and private operations evidence.
8. Deploy the admitted administrator digest behind the approved OIDC/edge boundary. Verify CSP, frame denial and a real least-privilege login.
9. Verify request correlation/logs/metrics and exercise record, privacy, erasure and restore controls before shifting a bounded canary cohort.
10. Run `node scripts/verify-deployment.mjs` against the shared endpoints and attach its redacted JSON plus the admission/release records to the protected change.

## Rollback

Stop the rollout on failed migration, manifest/provenance verification, readiness, error/latency threshold, auth boundary, custody check or missing telemetry. Select all three references from the previously accepted manifest; never mix manifest versions, restore the database or delete migration history for an application rollback. Before shifting traffic, confirm the previous API understands the current schema, erasure ledger and outstanding durable jobs. After rollback, repeat liveness/readiness/correlation, administrator security headers, metrics/job evidence and deletion/restore checks.

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
