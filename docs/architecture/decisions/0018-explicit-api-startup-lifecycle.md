# ADR-0018: Separate API metadata assembly from runtime lifecycle work

Date: 2026-07-19

Status: accepted; remote CI acceptance remains required for the implementing commit

## Context

The first GitHub Actions run for the deployment-artifact commit failed in the unit-test phase. `openapi.test.ts` created and initialized the complete Nest application to inspect routes and CORS behavior. Initialization also invoked `PhotoCandidatesService.onModuleInit()`, which immediately expired database rows, and `ObjectStorageService.onModuleInit()`, which checked the bucket. The test passed locally only while disposable dependencies from an earlier integration run were still alive. With a clean runner it failed on PostgreSQL before reaching object storage.

OpenAPI generation has the same structural need as the test: assemble the real application graph and HTTP configuration without claiming that runtime dependencies are available. Starting PostgreSQL/Redis/MinIO before unit tests would hide the coupling and make the unit gate slower and order-dependent. Removing runtime maintenance would instead weaken production behavior.

## Decision

1. Register `AppModule` dynamically with an injected `ApplicationLifecyclePolicy` selected by an explicit `ApplicationStartupMode`.
2. Keep `runtime` as the default and as the only mode used by `main.ts` and integration/deployment execution. It verifies external object storage on initialization and starts photo-expiry and durable-data-operation background work.
3. Add a `metadata` mode for application-graph inspection. It constructs the real controllers, providers, guards, middleware, CORS and OpenAPI surface, but skips external startup checks and background timers.
4. Use `metadata` only in the OpenAPI/CORS unit test and the committed OpenAPI generator. Business requests made after metadata initialization may still use their real dependencies; the mode is not an in-memory substitute for integration tests.
5. Keep dependency readiness at `/v1/health` and in the deployment black-box verifier. Metadata mode cannot be selected through an environment variable or the production process entry point.
6. Require `pnpm test` to pass while local service containers are stopped. Integration, restore, E2E and deployment-smoke stages continue to start and exercise real dependencies separately.

## Consequences

- Unit and contract generation no longer depend on test order or workstation residue.
- Runtime startup behavior remains fail-visible and background maintenance remains enabled by default.
- The difference between structural application inspection and a traffic-serving process is explicit, typed and reviewable at module registration.
- Any new `OnModuleInit` external I/O or timer must honor the lifecycle policy or be covered by the appropriate integration stage.
- Metadata mode does not prove database, Redis, object storage or worker health; those claims remain in later gates.

## Rejected alternatives

- Start every dependency before unit tests: preserves the accidental coupling and makes the unit gate an implicit integration suite.
- Set only `DATA_OPERATIONS_WORKER_ENABLED=false`: does not cover photo expiry or object-storage verification and gives a narrowly named variable unrelated responsibilities.
- Mock individual providers in the OpenAPI test: risks inspecting a graph different from the shipped application and becomes brittle as providers are added.
- Remove `app.init()`: would stop proving the real initialized CORS/HTTP behavior.
- Catch and ignore startup failures in runtime mode: could serve traffic with missing custody dependencies and obscure deployment faults.

## Rollback

Revert the lifecycle-policy registration and affected hooks as one source change, then restore the previous OpenAPI call sites. Do not compensate by weakening runtime dependency readiness or deleting maintenance work. A rollback is acceptable only if unit CI deliberately provisions all required services before application initialization and documents the resulting integration semantics.
