# ADR 0002: Health measurement contract and persistence

Date: 2026-07-18

Status: accepted

## Context

The product must combine manual, device, imported and AI-derived values without silently turning estimates into facts. Multiple clients need the same field names and OpenAPI description, while the database needs enforceable source/status invariants. Unit conversion and plausibility checks must be deterministic and testable independently of NestJS or a model provider.

## Decision

- Define transport schemas in `packages/contracts` with Zod 4 and use its native OpenAPI 3.0 JSON Schema generation.
- Put metric definitions, allowed units, conversion factors and input guardrails in framework-free `packages/domain`.
- Use PostgreSQL 18 and parameterized `pg` queries for the initial modular monolith. Do not add an ORM until query/migration repetition demonstrates a concrete need.
- Store both canonical and display values/units so analytics remain consistent without erasing what the user entered.
- Require AI estimates to be `candidate` with confidence, model version and prompt version at both contract and database layers.
- Use per-user idempotency keys plus a request hash: identical retries return the existing record; reused keys with changed content return conflict.
- Apply ordered SQL migrations transactionally and record their SHA-256 checksum; never edit an applied migration.

## Consequences

Positive:

- Client, API documentation and tests share one executable contract.
- Calculations operate on canonical units while the UI can reproduce the original entry.
- Unsafe AI persistence and idempotency mistakes fail even if a future code path bypasses controller validation.
- SQL behavior stays visible during the early schema-learning phase.

Costs and follow-up:

- OpenAPI documents structural fields but cannot express every Zod cross-field refinement; response descriptions and tests remain necessary.
- Metric additions require synchronized contract, domain and SQL migration changes. A validator test must detect drift as the set grows.
- Direct `pg` mapping is explicit but verbose; reconsider a typed query layer only when measured duplication justifies it.
- The temporary demo-user header is not authorization and cannot leave local development.

## Current evidence

- 17 unit tests include contract, OpenAPI, migration drift and unit normalization checks.
- 4 PostgreSQL integration tests exercise readiness, persistence, normalization, idempotency, list isolation and AI rejection at both HTTP and direct-database boundaries.
- Migration execution is idempotent and records a 64-character checksum.
- The generated contract is committed at `docs/api/openapi.json`.
