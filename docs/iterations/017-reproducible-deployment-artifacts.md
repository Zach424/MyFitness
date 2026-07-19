# Iteration 017 — Reproducible deployment artifacts

Date: 2026-07-19

State: complete locally for deployable OCI artifacts, migration-before-traffic topology and black-box acceptance; remote CI/GHCR evidence, managed shared infrastructure, real WeChat/OIDC credentials, domains/TLS and public traffic remain open

## 1. Scope and success standard

Turn the locally proven source tree into cloud-neutral runtime artifacts that can be published, migrated, started, verified and rolled back by exact revision. Fix the API network boundary that made a container unreachable, then prove the actual images rather than only compiling Dockerfiles.

This round does not create a cloud account, managed database/Redis/bucket/KMS, DNS/TLS/WAF, OIDC tenant, Mini Program registration, AppID/AppSecret, telemetry backend, paging owner or public deployment. Those are external ownership inputs and form iteration 018. The smoke environment deliberately uses the development identity adapter, fixture AI and disposable MinIO and is not a production approval.

Acceptance required three non-root images with pinned bases; self-contained API and standalone administrator output; explicit safe bind defaults; one-shot checksum migration before traffic; external liveness/readiness/security verification; failure-safe cleanup; production environment preflight; CI and immutable image publishing definitions; architecture/runbook/status/risk/roadmap/ADR updates; full regression; one archive and one commit.

Rollback point: keep all applied migrations. Roll application services to the previously verified image digests only if they support the current schema, ledger and outstanding durable jobs. Never restore an older database or weaken auth/custody controls as application rollback.

## 2. Structure and technology state

New and changed boundaries:

- `apps/api/Dockerfile`: filtered workspace build, `pnpm deploy --prod --legacy`, migrations, non-root Node runtime, OCI labels and liveness health check.
- `apps/admin/Dockerfile`: filtered workspace build, Next.js standalone/static runtime, non-root Node process, OCI labels and health check.
- `services/ai/Dockerfile` + `requirements.lock`: pinned Python base manifest and complete runtime dependency closure, non-root worker and health check.
- `apps/api/src/config.ts` + `main.ts`: validated `API_HOST`; loopback development default and container-ready production default.
- `apps/api/src/scripts/verify-production-config.ts`: fail-closed, redacted production secret/mode/protocol preflight.
- `infra/deploy/compose.smoke.yaml`: pinned PostgreSQL/Redis/MinIO, migration gate, three image services and host-only acceptance ports.
- `scripts/verify-deployment.mjs`: black-box API correlation/readiness, AI contract and administrator security-header checks.
- `scripts/run-deployment-smoke.mjs`: sequential builds, bounded wait, diagnostic logs on failure and unconditional container/volume cleanup.
- `.github/workflows/ci.yml`: source/audit/test/eval/build/integration/E2E gates followed by image-topology smoke.
- `.github/workflows/publish-images.yml`: explicit/tag-triggered multi-architecture GHCR build, immutable commit tags and provenance attestations.
- `infra/deploy/production.env.example`, deployment runbook and ADR-0017: secret inputs, rollout order, evidence and rollback contract.

Node 24.13.0 and Python 3.12.11 base indexes are pinned by digest. pnpm remains exactly 11.9.0. PostgreSQL 18.4, Redis 8.8.0 and MinIO keep exact tags plus digests in the acceptance topology. No cloud SDK, orchestrator or vendor-specific infrastructure dependency was added.

## 3. Design and implementation methods

### Runtime boundaries

The API image installs only `@myfitness/api...`, builds contracts/domain/API, then creates a portable production dependency tree. Its working directory preserves the monorepo depth expected by checksum migrations. The administrator image consumes Next standalone output instead of carrying pnpm/source/build tooling. Both final images use the base image’s unprivileged `node` user. The AI image retains UID 10001 and now installs fully pinned transitive packages.

The original hard-coded `127.0.0.1` listen address would pass an in-container health request but reject every peer container. `API_HOST` now accepts only IP literals, defaults to loopback for safe local development and `0.0.0.0` for production; Docker also sets the value explicitly. This keeps host binding separate from DNS service discovery.

### Migration and acceptance topology

The same API image runs `dist/database/migrate.js` once. Compose waits for PostgreSQL, requires migration exit zero, then starts the API; the administrator waits for API health. API readiness verifies PostgreSQL, Redis and object storage, while liveness remains dependency-free. All published host ports bind to `127.0.0.1` and all named volumes are deleted after the test.

The verifier runs outside the containers so it catches bind/port/network errors. It requires a UUIDv4 response correlation ID, exact API/AI health contracts, all readiness dependencies, administrator HTML, CSP frame denial, `X-Frame-Options: DENY` and absence of `X-Powered-By`. It prints only endpoints, check names and timestamp.

### CI, publication and rollback

Main/PR CI replays frozen install, format, production audit, typecheck, unit/worker/evals, builds, real integration and Chromium E2E before the image smoke. Publication is separate and deliberate. It creates `linux/amd64` and `linux/arm64` GHCR artifacts for API/admin/AI with a full `sha-*` tag, optional version tag, OCI metadata and registry provenance attestation.

Deployment identity is the digest, not `latest`. Schema migration is forward-only. A release record must hold the current and prior digest set; rollback changes images, re-verifies the same black-box contract and preserves database/erasure controls.

## 4. Validation evidence

- API targeted build passed after the bind/config changes.
- Real `pnpm deploy:smoke` passed after building all three final images. The one-shot task applied/verified 15 migrations, every container health check passed, and the external result was:

```json
{
  "status": "ok",
  "checks": [
    "api-liveness-and-correlation",
    "api-postgres-redis-object-readiness",
    "ai-worker-health",
    "administrator-html-and-security-headers"
  ]
}
```

- The smoke runner removed its API/admin/AI/PostgreSQL/Redis/MinIO/migration containers, private network and both named volumes. No smoke service or volume remained.
- Final local image inspection reports explicit non-root users and health commands: API `node` at 101.2 MB, administrator `node` at 90.3 MB and AI `myfitness` at 48.5 MB.
- `pnpm format:check` and full workspace typecheck passed.
- `pnpm test`: 32 files / 103 tests passed, including six production identity/network configuration cases.
- AI worker: 7/7; weekly-plan explanation eval: 7/7; food-photo eval: 8/8. Fixture providers were used and no paid model call was made.
- `pnpm build` completed contracts/domain/API/administrator/H5 output and the separate WeApp production build passed. Existing non-blocking bundle/cache warnings remain registered.
- `pnpm audit:prod`: 0 critical, 0 high, 6 moderate. The registered Taro build-chain findings remain.
- `pnpm db:migrate`: 15 checksum-protected migrations applied/verified. `pnpm test:integration`: 11 files / 42 tests passed.
- Real `backup-restore-erasure-v2` drill passed with one ledger entry, one recreated identity suppression, one erased restored user, zero users after replay and completed backup disposition.
- Playwright Chromium: 21/21 product, administrator and privacy flows passed.
- Production configuration preflight passed with WeChat-only auth, `0.0.0.0` bind, HTTPS AI, `rediss://`, HTTPS/AES256 object storage, disabled bucket creation and redacted output.
- Final local custody audit found zero users, sessions, jobs, receipts, suppressions, administrator sessions/audits, private objects and restore databases. Local service containers were stopped. The GitHub Actions definitions cannot claim remote execution until this commit reaches `main` and its run is observed.

## 5. Problems found and experience captured

- A service can be healthy from itself and unreachable from its peers. Container acceptance must originate outside the container, not rely only on `HEALTHCHECK`.
- Dockerfile existence is not deployment evidence. The first complete test found the bind defect, migration path assumptions, image sharing order and external registry behavior before a cloud platform was involved.
- Parallel cold builds multiplied network pressure and downloaded the whole 1316-package workspace twice. Filtering workspace closures reduced API/admin installs to 378/249 packages; sequential image builds make the proof more reliable and diagnosable.
- An intermittent registry response made pip report that the common `click` package did not exist. Fully pinning the Python runtime closure and bounded retries turned an ambiguous resolver failure into reproducible inputs without hiding permanent failure.
- `pnpm deploy` defaults require injected workspace packages. The repository deliberately uses documented legacy deployment mode, after a frozen build, because changing workspace injection globally would affect every product package.
- A migration binary’s relative asset path is part of its runtime contract. Preserving `/app/apps/api` plus `/app/infra` avoided an environment-only migration failure.
- Base tags alone drift. Exact version plus multi-architecture manifest digest gives a reviewable update point while retaining amd64/arm64 release builds.
- A release workflow and a deployment are different states. Registry publication proves artifacts; managed custody, real credentials, telemetry ownership and traffic verification remain separate gates.

## 6. Global state review, remaining risks and next step

The product loop remains complete locally through authenticated records, trends, plans, AI/photo proposals, privacy ownership, operator evidence and durable erasure. It now also has verified deployable runtime artifacts and a reversible deployment unit. CI/GHCR workflows are committed but remote-run evidence is still pending until push.

Release risks carried forward: managed China-region infrastructure/account/budget ownership; real WeChat AppID/secret/domain/device proof; H5 identity; OIDC tenant/access governance; KMS/IAM/lifecycle/versioning/replication and backup/ledger ownership; centralized metrics/logs/alerts and responders; calibrated edge/proxy limits; real AI canary and data policy; catalog licensing; accessibility/bundle budgets; six moderate Taro advisories; and explicit erased-identity return policy.

Iteration 018 is the managed shared deployment. It must choose the provider/region from actual entity, traffic, budget and operator inputs; inject secrets; deploy exact image digests; run migrations; prove real identity, custody, telemetry and edge behavior; execute canary/rollback; and archive provider evidence without secrets. Until those inputs exist, no public/shared deployment claim is allowed.

## 7. References

- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
- [API operations runbook](../operations/API_OPERATIONS_RUNBOOK.md)
- [ADR-0017](../architecture/decisions/0017-reproducible-oci-deployment-boundary.md)
- [pnpm Docker guidance](https://pnpm.io/docker)
- [pnpm deploy](https://pnpm.io/cli/deploy)
- [GitHub Docker image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
