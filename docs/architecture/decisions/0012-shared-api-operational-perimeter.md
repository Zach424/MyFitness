# ADR-0012: Shared API operational perimeter before administrator access

Date: 2026-07-19

Status: accepted

## Context

The API had database-backed authentication and sensitive AI/photo/privacy mutations but no request correlation, shared abuse state or bounded operational measurements. A controller interceptor alone cannot protect invalid-token database lookups because Nest authentication guards run first. Building a support UI on this boundary would increase exposure without giving operators reliable evidence.

## Decision

- Validate or generate one UUIDv4 request ID in outer middleware and echo it on every response.
- Apply a Redis-backed IP ingress guard before route authentication, then a second actor/route policy after a server-owned principal exists.
- Store only HMAC actor fingerprints in expiring Redis keys and use one Lua operation for cross-replica increment/expiry/TTL decisions.
- Fail business traffic closed with a correlated `503` when shared protection is unavailable; keep dependency-free liveness separate from PostgreSQL/Redis readiness.
- Record completion metrics and structured minimal logs in outer middleware so authentication failures and rejected requests are included.
- Protect Prometheus text with a separate operations token and keep route labels bounded to registered templates.
- Defer administrator UI, user search and mutations until verified operator identity, RBAC and immutable audit contracts exist.

## Consequences

Invalid-token traffic is bounded before it reaches the session hash lookup, authenticated expensive routes have independent quotas, and multiple API processes share the same result. Operators can correlate a user-visible request ID with a log event and scrape process metrics without receiving raw health data or direct identifiers.

Redis becomes a readiness dependency for business traffic. The service intentionally does not fail open; restoring Redis or rolling back the release is safer than silently running unbounded. Current limits use a simple fixed window and local metrics are process-scoped, so centralized scraping, alert routing, policy calibration and boundary-burst evaluation remain deployment work.
