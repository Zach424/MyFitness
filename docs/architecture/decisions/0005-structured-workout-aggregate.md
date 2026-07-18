# ADR-0005: Structured workout aggregate and immutable snapshots

Date: 2026-07-18

Status: accepted

## Context

A workout must support quick repetition in the client, accurate completed-set summaries, exercise-level trends and auditable correction. A single opaque JSON column makes later queries and constraints fragile; a fully event-sourced model adds projection and operational complexity before the core loop is proven. Repeating the last workout must also avoid copying prior completion or discomfort as new facts.

## Decision

- Store the current workout in relational session, ordered exercise and ordered set tables with cascading aggregate ownership.
- Preserve the user's display load/unit and compute canonical kilograms on the server through a deterministic domain function.
- Count volume, distance and active duration from completed sets only.
- Replace the exercise/set graph inside one transaction when the authenticated owner supplies the current revision.
- Append a complete JSON snapshot for every accepted create, update and delete in the same transaction.
- Use per-user idempotency keys for creation, optimistic revision checks for replacement/deletion, soft deletion for normal lists and owner-only immutable history.
- Implement repeat-last in the client as a new draft that copies structure but resets completion, time, pain, fatigue, note, identity and revision.

## Consequences

Relational current state supports later exercise analytics and strong database checks; immutable JSON snapshots make historical reconstruction independent of mutable child rows. Replacement performs more writes and snapshot duplication consumes storage, but the aggregate is bounded and correctness is clearer than partial child patches.

Catalog names remain denormalized in each exercise so a future catalog rename cannot rewrite history. The initial catalog is product copy, not a global exercise authority. Rest intervals, supersets and plan linkage need additive contract/migration decisions rather than being hidden in notes.

Soft deletion remains audit behavior rather than privacy erasure. Imported sources must earn provider verification and provenance rules before being exposed, and AI must not write completed workout facts without explicit confirmation.
