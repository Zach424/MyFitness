# Iteration 018 — Hermetic CI bootstrap

Date: 2026-07-19

State: implementation and local acceptance complete; the new main-branch CI run is post-commit exit evidence and must be green before iteration 019 begins

## 1. Scope and success standard

The planned managed-environment work was paused when the first real GitHub Actions run exposed a correctness defect in the source gate. CI run `29680197021` for commit `0db4bf9` failed at `pnpm test`: the OpenAPI suite attempted PostgreSQL on `127.0.0.1:54329`. Deployment smoke was correctly skipped. The run also reported Node 20 action-runtime deprecations.

This round makes API contract inspection hermetic, updates the workflow action runtimes, and proves the full unit gate with PostgreSQL, Redis, MinIO and all MyFitness containers stopped. It does not provision cloud infrastructure, publish images, configure credentials/domains or open traffic.

Acceptance requires: exact clean-environment reproduction; an explicit typed split between metadata assembly and runtime lifecycle work; no external startup I/O in OpenAPI test/generation; unchanged production runtime defaults; all 103 unit tests with dependencies stopped; type/format/static workflow checks; full dependent regression; a new remote main CI run; status/risk/roadmap/runbook/ADR updates; one archive, one Conventional Commit and a normal push.

Rollback point: revert the lifecycle-policy and workflow action update together. Do not make runtime checks permissive, bypass failed tests or start hidden services merely to turn CI green.

## 2. Structure, technology and design state

New and changed boundaries:

- `apps/api/src/application-lifecycle.ts`: typed `runtime` and `metadata` startup policies plus a Nest injection token.
- `apps/api/src/app.module.ts`: dynamic registration supplies exactly one startup policy to the real module graph.
- `apps/api/src/bootstrap.ts`: `createApplication` accepts an explicit startup mode and defaults to `runtime`.
- `PhotoCandidatesService` and `DataOperationsService`: background reconciliation/timers run only under the runtime policy.
- `ObjectStorageService`: startup bucket verification/creation runs only under the runtime policy.
- `openapi.test.ts` and `scripts/generate-openapi.ts`: use metadata mode while retaining real routing, guards, middleware, CORS and Swagger assembly.
- `.github/workflows/ci.yml`: official checkout, pnpm, Node and Python setup actions move to Node-24-capable v6 releases.
- `.github/workflows/publish-images.yml`: checkout moves to v6; publication remains tag/manual only.
- `scripts/run-deployment-smoke.mjs`: each image build gets two bounded delayed retries; BuildKit cache resumes transient registry failures while permanent failures remain fatal.

Node stays pinned to 24.13.0, pnpm to 11.9.0 and Python to 3.12.11. No product dependency, API contract, database migration or visual design changed. The design work in this round is operational: lifecycle ownership is explicit, while the user-facing interface remains unchanged.

## 3. Implementation method

### Reproduce before changing

All MyFitness containers were confirmed stopped. Running only `apps/api/src/openapi.test.ts` then failed with `ECONNREFUSED 127.0.0.1:54329`, with the stack `DatabaseService.withTransaction → PhotoCandidatesService.expireOld → onModuleInit → app.init`. This matched GitHub exactly and proved that the earlier local pass was contaminated by an integration dependency left running.

### Preserve the real graph

The fix does not replace the API with a test module. `AppModule.register('metadata')` still creates all shipped controllers/providers and applies the same prefix, middleware, rate-limit guards/interceptors, CORS and OpenAPI mounting. The injected policy only suppresses work that belongs to a traffic-serving process: background timers and startup dependency verification.

`runtime` remains the default argument, is used by the production entry point, and retains object-store verification plus maintenance jobs. Integration tests continue to use runtime mode and real PostgreSQL/Redis/MinIO. This preserves separate evidence layers instead of mixing unit and integration setup.

### Update the hosted action runtime

The failing run named `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5` and `pnpm/action-setup@v4` as Node 20 actions forced onto Node 24. Their official v6 releases support the Node 24 action runtime. Workflow versions were advanced without changing language/runtime pins or gate order.

## 4. Validation evidence

- Clean reproduction before the change: targeted OpenAPI suite failed with PostgreSQL connection refused; no MyFitness container was running.
- Targeted acceptance after the change: OpenAPI/CORS suite passed, 1 file / 2 tests, with all external dependencies still stopped.
- Full dependency-free unit gate: 32 files / 103 tests passed in 8.57 seconds.
- Full repository format check and workspace typecheck passed.
- Production audit remained 0 critical, 0 high and 6 registered moderate Taro build-chain findings.
- AI worker tests passed 7/7; weekly-plan explanation evaluation passed 7/7; food-photo evaluation passed 8/8. Fixture providers were used.
- Contracts, domain, API, administrator and H5 production builds passed; the independent WeApp production build passed. Registered Taro bundle/cache warnings remain unchanged.
- All 15 checksum migrations applied/verified; integration passed 11 files / 42 tests.
- The real `pg_dump → pg_restore → ledger replay` proof completed with one erased restored user, one recreated identity suppression and zero restored users after replay.
- Playwright passed 21/21 product, privacy and administrator flows.
- The first cold deployment-smoke attempt stopped safely when the public registry failed on administrator package 249/249 after repeated connection resets. No application compile or topology step failed, and cleanup left no smoke service/volume.
- After adding bounded image-build retry, the complete three-image smoke passed. The one-shot migration exited zero and the external verifier accepted API liveness/correlation, PostgreSQL+Redis+object readiness, AI health and administrator HTML/security headers. All smoke containers, network and volumes were then removed.
- Before local cleanup, custody counts were zero for users, user sessions, jobs, erasure receipts, identity suppressions, administrator sessions and administrator audit events. The explicit local test containers and PostgreSQL/object-storage volumes were removed; no MyFitness container or smoke volume remained.
- Remote acceptance is the CI run created by pushing this implementing commit. Its final URL/result is reported in the handoff; a failure keeps iteration 018 open and blocks managed deployment.

## 5. Problems found and experience captured

- A local green unit suite is weak evidence when an earlier test stage can leave dependencies running. Prove hermetic tests with those services explicitly absent.
- Nest lifecycle hooks execute for structural tests after `app.init()`. Route/CORS/OpenAPI inspection therefore needs an application-level lifecycle contract, not assumptions about which providers happen to be touched.
- Starting dependencies earlier in CI can turn a defect into an ordering requirement. Unit, integration and image acceptance should each declare their own dependency boundary.
- Catching a worker error is not the same as avoiding startup I/O: photo expiry failed hard, object storage would have been the next external check, and both needed one coherent policy.
- CI definitions are not evidence until a hosted runner executes them. The first remote run immediately found a workstation-residue defect that the local full suite had masked.
- Hosted action runtimes have a lifecycle independent of the project's Node version. Pinning Node 24 for the application does not upgrade JavaScript actions.
- A cold image build can exhaust a package manager's request retries on the final package. Retrying the bounded image build, not weakening frozen-lockfile checks, safely reuses verified BuildKit cache and still fails permanent defects.

## 6. Global review, remaining risks and next step

The product and deployment-artifact functionality is unchanged. The source pipeline now has an explicit, testable startup boundary and local clean-run proof. R-022 remains open until the implementing commit's complete hosted quality and deployment-smoke jobs are green; GHCR publication is still unexercised.

Iteration 019 resumes the managed shared test deployment only after that result. It still requires user/organization inputs for cloud entity/account/region/budget, secrets, real WeChat and OIDC identities, domains/TLS, managed PostgreSQL/Redis/object storage/KMS, telemetry/paging ownership and approved AI-provider policy. No local fix can safely invent those external authorities.

## 7. References

- [Failed CI run 29680197021](https://github.com/Zach424/MyFitness/actions/runs/29680197021)
- [ADR-0018](../architecture/decisions/0018-explicit-api-startup-lifecycle.md)
- [Deployment runbook](../operations/DEPLOYMENT_RUNBOOK.md)
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
- [actions/setup-python](https://github.com/actions/setup-python)
- [pnpm/action-setup](https://github.com/pnpm/action-setup)
