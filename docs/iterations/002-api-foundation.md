# Iteration 002 — API foundation and health-record contract

Date: 2026-07-18

State: complete for the local API/data foundation

## 1. Scope

Re-anchor on trustworthy data before building profile screens or AI features. This round creates a runnable API and a narrow measurement contract whose provenance, units, timestamps, status and idempotency behavior are enforced from HTTP input through PostgreSQL.

Success criteria:

- NestJS starts on the supported Node runtime and exposes a database-aware readiness route.
- Shared schemas describe body/recovery measurement requests and responses and generate OpenAPI 3.0.
- Unit normalization and plausible-input guardrails are deterministic and tested.
- A transactional PostgreSQL migration creates constrained, indexed persistence and detects migration drift.
- Create/list endpoints persist canonical/display values with per-user idempotency.
- AI estimates cannot be written as confirmed facts at either contract or database level.
- PostgreSQL Compose, migration, unit, type, build, integration and actual runtime health checks pass.

Rollback boundary: the round creates a local Docker network, PostgreSQL container and named data volume using development-only credentials. It creates no cloud database, public endpoint, production account, user identity, real health data or model-provider request. `pnpm db:down` removes the container/network and preserves the volume.

## 2. Changes made

- Added `apps/api` with NestJS 11.1.28, Swagger/OpenAPI, `pg`, runtime config, database readiness, create/list health-record endpoints and a temporary local identity header.
- Added `packages/contracts` with Zod 4.4.3 schemas for 9 body/recovery metrics, units, source metadata, confidence, candidate/confirmed state, timestamps and response records.
- Added `packages/domain` with kg/lb, cm/in and hour/minute conversion plus metric/unit compatibility, plausible bounds and integer score rules.
- Added a PostgreSQL 18.4 Compose service and `0001_health_records.sql` with 30 constraints, two access indexes and per-user idempotency uniqueness.
- Added a transactional migration runner with ordered files, SHA-256 checksums, idempotent re-execution and drift failure.
- Added committed OpenAPI generation, API usage notes, the health-record model document and ADR-0002.
- Added one integration-test configuration so normal unit tests never accidentally require Docker.

Implementation method: the HTTP boundary parses one shared contract; a framework-free domain layer converts the display measurement; parameterized SQL persists both representations; database checks independently repeat safety-critical source/status rules. Request hashes distinguish legitimate retries from idempotency-key reuse with changed content.

Design impact: no client surface changed. The data vocabulary preserves the existing Rhythm Rail grammar—AI remains a visibly uncertain candidate, while only confirmed measurements may appear as facts—so later API integration will not collapse estimated and confirmed states.

## 3. Validation evidence

Automated and runtime evidence:

- `pnpm install`: passed with supply-chain policy; `@scarf/scarf` telemetry install script is explicitly denied.
- `pnpm peers check`: no peer dependency issues.
- `pnpm test`: 6 files and 17 unit tests passed.
- `pnpm typecheck`: contracts, domain, tokens, client and API passed after shared packages were built topologically.
- `pnpm build:api`: contracts, domain and NestJS API compiled successfully.
- OpenAPI generation: version 3.0.0 with `/v1/health` and `/v1/health-records` GET/POST paths and full request properties.
- `pnpm db:up`: PostgreSQL 18.4 became healthy; the first image pull failed once with a network EOF and succeeded unchanged on retry.
- `pnpm db:migrate` twice: one migration applied/verified both times; database inspection found a 64-character checksum and 30 constraints.
- `pnpm test:integration`: 1 file and 4 tests passed against real PostgreSQL, including a direct constraint violation that bypasses the API.
- Actual listening process: readiness returned `status=ok`, `database=up`; Swagger UI returned HTTP 200 and runtime OpenAPI reported 3.0.0.
- Integration cleanup left 0 test health records in the database.

Reference checks used current official guidance: NestJS requires Node 20+ and documents `SwaggerModule` generation; Zod 4 provides native `z.toJSONSchema(..., { target: 'openapi-3.0' })`; PostgreSQL 18.4 is the current supported release. See the [NestJS prerequisites](https://docs.nestjs.com/first-steps), [NestJS OpenAPI guide](https://docs.nestjs.com/openapi/introduction), [Zod JSON Schema guide](https://zod.dev/json-schema), and [PostgreSQL version policy](https://www.postgresql.org/support/versioning/).

## 4. System status update

- Client: unchanged and still fixture-backed; its multi-end build remains valid.
- API/data: complete for the measurement foundation; real PostgreSQL persistence, readiness and OpenAPI exist.
- Contracts/domain: partial product coverage. Body/recovery measurements exist; profile, workouts, nutrition, photos and plans do not.
- Privacy/safety: improved through source metadata, AI candidate-only rules and no user ID in request bodies; consent and real authorization remain absent.
- Testing: 17 unit and 4 database integration tests; lint, CI, performance and production observability remain.
- Deployment: reproducible local stack only; there is no shared test or production environment.

This round advances the product from a rendered concept to a validated data boundary without claiming onboarding, complete records, AI or deployment are operational.

## 5. Risks / open issues

- `x-demo-user-id` is deliberately not authentication. The API must remain bound to localhost until iteration 003 replaces it with verified identity context.
- OpenAPI 3.0 captures the structural schema but not every Zod cross-field refinement; descriptions and executable negative tests are required.
- Metric/unit/source sets span contract, domain and SQL; a drift test now blocks omissions, while semantic changes still require review.
- Plausible bounds prevent obvious input mistakes but are not clinical reference ranges and must never drive diagnoses.
- The API lacks request IDs, structured logs, rate limits, metrics, backups and production secret handling.
- PostgreSQL runs in a local named volume with development credentials. No real or sensitive user data belongs there.
- The first Docker image pull hit a transient EOF; pinning/attesting production images and maintaining a regional registry mirror remain deployment work.

Experience captured: workspace source aliases conflict with package `rootDir`; build shared packages topologically and consume their declarations instead. Test globs must explicitly exclude linked `node_modules`. Nest's OpenAPI structural types are not all re-exported from the public root. Package install scripts remain deny-by-default; a telemetry-only transitive script was recorded as false rather than broadly approved. Prettier's programmatic API does not load repository config automatically, so the OpenAPI generator resolves and applies the actual config before writing its committed artifact.

## 6. Next step

Primary: Iteration 003 will implement adult onboarding and goals through the real API. It will add user/profile/goal/consent migrations, a local authentication adapter that can later be replaced by WeChat/phone verification, risk-screening exits, optimistic concurrency, and client/API end-to-end happy/error paths.

Deferred candidates:

- Body and recovery record UI against this API.
- Workout/nutrition schemas and persistence.
- AI worker, image upload and public deployment.

They remain deferred until identity, profile ownership and purpose-specific consent are enforced.
