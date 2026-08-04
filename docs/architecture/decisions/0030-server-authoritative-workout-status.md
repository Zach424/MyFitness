# ADR-0030: Server-authoritative workout completion status

Date: 2026-08-04

Status: accepted

## Context

The workout client derived `completed` when every set was checked and `partial` otherwise, but the shared write contract still required callers to send that result. Another client or a future import could therefore persist `completed` alongside an incomplete set graph. Completed-only volume remained correct, yet lists, exports and snapshots could communicate a contradictory session state.

## Decision

- Treat set-level `completed` flags as the only completion evidence and derive session status in the shared server domain.
- Return `completed` only when the aggregate has at least one set and every set is complete; otherwise return `partial`.
- Remove status from new client requests. Temporarily accept an optional deprecated compatibility hint from older clients, but ignore it for storage and responses.
- Exclude the compatibility hint from new idempotency hashes so changing only that non-authoritative value replays the same creation. Accept the exact legacy request hash when resolving pre-change rows.
- Store the derived value as a relational cache and in new immutable snapshots. Backfill current session rows from persisted set flags without rewriting historical snapshots.
- Re-derive current API responses from the loaded set graph so a stale cache cannot become user-visible authority.

## Consequences

All API callers and later imports receive one invariant without duplicating client logic. Old clients remain accepted during a controlled compatibility window, while OpenAPI marks their hint as deprecated in its description. The database cache is not an independent source of truth, and pre-iteration-032 snapshots continue to preserve what the system originally accepted. Removing the compatibility hint entirely requires a future client-version/usage gate rather than an unannounced breaking change.
