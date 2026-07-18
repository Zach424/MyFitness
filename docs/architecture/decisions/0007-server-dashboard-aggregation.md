# ADR-0007: Server-owned Today and bounded trend aggregation

Date: 2026-07-18

Status: accepted

## Context

Today previously rendered fixtures. Combining three paginated client lists would truncate 90-day history and duplicate timezone/readiness rules across H5 and WeApp. The next plan iteration also needs one trustworthy evidence input rather than presentation-layer guesses.

## Decision

- Add one authenticated, read-only `/v1/insights/dashboard` projection over confirmed, non-deleted measurements, workouts and meals.
- Query a 91-day storage window directly, group workout/meal child rows in PostgreSQL and build local-day evidence in the requested IANA timezone.
- Compute readiness only from the latest energy, sleep-quality, stress and soreness records in three days. Normalize negative signals, use an equal-weight 0–100 summary and return `null` when evidence is absent.
- Return explicit 7/30/90-day counts and totals; do not call them goals, recommendations or AI output.
- Keep source records authoritative. The dashboard stores no duplicate state and can always be rebuilt.

## Consequences

Both clients receive identical bounded evidence without list-limit drift, and later planning can consume a versioned projection. The read query joins several aggregates and will need indexes/caching after measured load. Equal weighting is intentionally simple and explainable, not clinically validated; future formula changes require versioning and regression evidence.
