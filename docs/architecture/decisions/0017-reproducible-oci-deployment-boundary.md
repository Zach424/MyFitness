# ADR-0017: Package runtime boundaries as reproducible OCI images

Date: 2026-07-19

Status: accepted for deployment packaging; workflow dependency identity is extended by ADR-0026, while managed shared infrastructure and public traffic remain pending

## Context

The local application stack proved business behavior but did not produce deployable API or administrator artifacts. The API also bound unconditionally to `127.0.0.1`, which made it unreachable through a container network. There was no automated migration-before-traffic topology, image acceptance test, CI definition, registry publishing path or immutable rollback unit. A source build passing on the workstation therefore did not prove that the runtime could start outside it.

The target cloud, China-region entity/account, domain, TLS termination, managed data services, OIDC tenant and real WeChat credentials are not yet available. Packaging must stay provider-neutral and must not turn local MinIO/fixture evidence into a production approval claim.

## Decision

1. Package the NestJS API, Next.js administrator BFF and FastAPI worker as three OCI images. Pin exact Node/Python base versions and manifest digests, run the final process as a non-root user, include OCI source/version/revision labels and define dependency-free process health checks.
2. Build only the required pnpm workspace closure. The API uses `pnpm deploy --prod --legacy` to create a self-contained runtime directory with compiled workspace dependencies. The administrator image copies only the Next.js standalone server and static output. The Python image installs a fully pinned runtime closure.
3. Make the API bind address explicit. Development defaults to loopback; production defaults to `0.0.0.0`; `API_HOST` accepts only an IP address. Container manifests set it explicitly.
4. Run checksum-protected migrations as a one-shot task from the same API image before API replicas start. Do not migrate independently from every replica and do not serve traffic before the task succeeds.
5. Keep `infra/deploy/compose.smoke.yaml` as a disposable artifact acceptance topology. It uses pinned local PostgreSQL/Redis/MinIO, fixture AI and non-production configuration; it proves image/network/migration/readiness behavior, not production storage, identity, TLS or operations controls.
6. Make `scripts/verify-deployment.mjs` the external black-box acceptance contract: API liveness/correlation, PostgreSQL+Redis+object readiness, AI health, administrator HTML and security headers. The runner always removes containers and volumes, including after failure.
7. Run source quality gates and the deployment smoke in GitHub Actions. Publish multi-architecture images to GHCR only for an explicit workflow dispatch or version tag. Every image receives both the immutable full-commit `sha-*` tag and release-tag metadata plus a registry provenance attestation.
8. Roll forward database migrations. Roll application images back only by selecting a previously verified immutable digest/`sha-*` tag that understands the applied schema and outstanding data-operation jobs.

## Consequences

- The three runtime boundaries can be built and exercised without choosing a cloud orchestrator.
- Source, build, migration and runtime failures become separate evidence rather than one workstation process.
- Development remains loopback-only by default while production/container networking is reachable by deliberate configuration.
- The smoke topology contains known non-production credentials and a fixture provider; it must never be exposed or treated as a shared environment.
- Image bases and Python transitive dependencies now require explicit maintenance updates. Lock changes must rerun worker tests and the full image smoke.
- GHCR publication does not deploy anything. A managed environment still needs secret injection, TLS/edge policy, data custody, telemetry, alert ownership and real identity proof.

## Rejected alternatives

- Choose Kubernetes or a named cloud before ownership/budget/region inputs exist: creates speculative infrastructure and does not resolve the missing decisions.
- Ship the monorepo and run `pnpm install` at startup: mutable, slow and unnecessarily exposes build dependencies.
- Use `latest` as the rollback selector: cannot identify or reproduce the running source revision.
- Run migrations from every API replica: introduces startup races and couples availability to schema work.
- Keep `127.0.0.1` in the API image: passes an in-container health check while remaining unreachable from every other service.
- Treat the local smoke as production: it has no managed custody, TLS, real identity, central monitoring or incident owner.

## Rollback

Stop traffic shifting, retain the applied migrations, and redeploy the last verified API/admin/AI image digests. Confirm the old API supports the current migration set and durable job/ledger versions before rollback. Rerun the black-box verifier and custody checks. Never restore an older database, remove a migration row, disable Redis fail-closed behavior or bypass the erasure worker as an application rollback shortcut.
