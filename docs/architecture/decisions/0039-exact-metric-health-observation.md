# ADR-0039: Exact-metric, confirmed-only health observation

Date: 2026-08-05

Status: accepted

## Context

Body and recovery measurements already have nine bounded metric codes, deterministic canonical-unit conversion, user display units, source/status provenance, optimistic corrections and soft deletion. The record page showed only the newest seven entries for the currently selected metric and could not expose longer windows, revision provenance or source/timezone detail.

Combining weight, waist, heart rate, sleep and subjective 1–5 scores into one chart would erase unit semantics. Counting AI candidates as facts would also violate the existing confirmation boundary. A persisted trend table would duplicate sensitive measurements and make corrections/deletions harder to keep current.

## Decision

1. Expose an owner-authenticated read projection at `GET /v1/insights/health/:metric`. The path accepts only the shared nine-code metric enum; labels are never query identity.
2. Read current, non-deleted rows for that exact metric with `status = confirmed`. AI estimates remain candidates and never contribute before a separate explicit confirmation workflow exists.
3. Calculate complete elapsed 7/30/90-day windows anchored to an optional reference instant. Each window exposes record count, distinct requested-timezone dates and canonical-unit minimum/maximum/average; an empty window keeps statistics null.
4. Return at most the latest 180 confirmed points from the 90-day window and expose `hasMore`. Every point retains record ID/revision, occurrence instant, requested local date, original record timezone, canonical value/unit, display value/unit and source provenance.
5. Derive the top-level canonical unit from returned evidence. Database/domain constraints already make it stable for one metric; an empty metric returns null rather than inventing a unit-bearing value.
6. Recompute from normalized current rows on every read. Replacement and soft deletion therefore change the projection without a materialized table, new migration or new privacy-export collection.
7. Render one metric at a time on a dedicated lazy H5/WeApp page. The calibration strip may show relative numeric position, but it must not label direction as improvement/decline or mix unlike units.
8. Do not diagnose, grade goals, compare users, establish normal ranges, turn subjective recovery scores into medical scores or prescribe changes from this observation.

## Consequences

Users can inspect longer correction-safe evidence while still seeing how each value was originally recorded. Canonical statistics remain comparable within one metric; display units and source/timezone/revision detail remain honest provenance. AI candidates, future records and other users stay outside the projection.

Minimum, maximum and average are descriptive only. They cannot establish completeness, causality, a healthy range or clinical meaning. The 90-day/180-point bounds intentionally defer longer histories and downsampling until measured need.

The extra lazy route moves total tree ceilings to 2.25 MB H5 and 750 KB WeApp. The existing 320 KB H5 entry, 200 KB asynchronous JavaScript, 25 KB WeApp vendor and 45 KB WeApp page-JavaScript limits remain unchanged.

## Alternatives rejected

- Group or select by display label: labels can change and are not stable identity.
- Combine metrics after normalization: canonical units remain fundamentally different and cannot share a meaningful scale.
- Include AI candidates with confidence styling: would turn an unconfirmed estimate into longitudinal fact evidence.
- Convert every point to the newest display unit: rewrites how historical measurements were actually entered.
- Add normal bands, arrows or goal colors: implies evaluation unsupported by the current product and clinical evidence.
- Persist rollups: duplicates sensitive data and adds correction/deletion synchronization without measured pressure.
