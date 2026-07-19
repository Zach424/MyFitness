# Deployment and image runbook

Status: OCI packaging and disposable topology are exercised locally; shared managed infrastructure and public traffic are not configured

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

GitHub Actions publishes `myfitness-api`, `myfitness-admin` and `myfitness-ai` to GHCR on a deliberate workflow dispatch or `vX.Y.Z` tag. Release only after the commit CI is green. Record all three returned image digests in the change ticket; the tag is discovery metadata, while the digest is the deployment identity.

Do not deploy mutable tags. Keep the previous verified digest set available for rollback. Registry provenance attestations must name the repository revision used by the release.

## Deployment order

1. Confirm managed PostgreSQL/Redis/object storage backups, encryption, network policy, capacity and named owners.
2. Load secrets and run the production configuration preflight.
3. Run one API-image migration job with `node dist/database/migrate.js`; stop on checksum drift or any non-zero exit.
4. Deploy AI privately and verify `/health` without exposing its service token.
5. Deploy API with no public traffic; verify `/v1/health/live`, then dependency readiness and private operations evidence.
6. Deploy administrator BFF behind the approved OIDC/edge boundary. Verify CSP, frame denial and a real least-privilege login.
7. Shift a small canary cohort, verify request correlation/logs/metrics and exercise record, privacy, erasure and restore controls before broader traffic.
8. Run `node scripts/verify-deployment.mjs` against the shared endpoints and attach its redacted JSON plus image digests to the deployment record.

## Rollback

Stop the rollout on failed migration, readiness, error/latency threshold, auth boundary, custody check or missing telemetry. Select the previously recorded image digests; never restore the database or delete migration history for an application rollback. Before shifting traffic, confirm the previous API understands the current schema, erasure ledger and outstanding durable jobs. After rollback, repeat liveness/readiness/correlation, administrator security headers, metrics/job evidence and deletion/restore checks.

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

No shared/public deployment may be described as complete until these owners and evidence are recorded.
