# ADR-0001: Platform and repository architecture

Date: 2026-07-18

Status: Accepted

## Context

The product must reach WeChat and H5 quickly, later support native health stores and wearables, keep shared data semantics, and isolate expensive or sensitive AI work. The repository currently has no implementation, so the first choice should optimize correctness and iteration speed without pretending every platform has identical APIs.

## Decision

1. Use a pnpm TypeScript monorepo.
2. Build the first user client with Taro 4, React, and TypeScript for WeChat Mini Program and H5.
3. Build a separate React Native App only after the MVP retention gate, sharing contracts, domain rules, tokens, and selected view models rather than forcing identical rendering code.
4. Use a NestJS modular monolith backed by PostgreSQL and Redis for the initial business API.
5. Place model and vision execution behind a queue-driven FastAPI worker and provider-neutral model gateway.
6. Keep deterministic health calculations and safety constraints free of UI, database, and model-provider dependencies.

## Consequences

Positive:

- Mini Program and H5 ship from one primary client codebase.
- TypeScript contracts reduce drift across client, admin, API, and later mobile work.
- Native integrations remain possible without compromising the MVP schedule.
- AI can be disabled or degraded without breaking core records.
- Modular monolith transactions and authorization remain simple during early growth.

Costs:

- The later React Native client will not share every Taro UI component.
- Python adds a second runtime once AI work begins.
- Platform-specific adapters and visual testing remain necessary despite shared code.
- The monorepo needs disciplined package boundaries and CI caching.

## Alternatives considered

- **One Taro codebase including React Native:** rejected as the default because platform health integrations and complex native behavior would still require platform-specific work, while coupling the MVP to the least mature path.
- **Flutter for all clients:** rejected because Flutter does not directly solve WeChat Mini Program delivery and would reduce shared TypeScript contracts with the web/admin stack.
- **Microservices from day one:** rejected because no traffic, team-boundary, or scaling evidence justifies the operational cost.
- **LLM-first business logic:** rejected because health-related calculations, limits, provenance, and persistence authority require deterministic behavior.

## Revisit triggers

- Taro cannot meet measured Mini Program/H5 performance or accessibility requirements.
- The team has strong Flutter/native expertise that changes delivery economics.
- A module has independent scaling, compliance, uptime, or ownership requirements proven by production evidence.
- AI must run entirely on-device or in a regulated deployment boundary.
