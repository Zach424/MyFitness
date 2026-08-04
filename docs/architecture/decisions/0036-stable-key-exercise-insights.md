# ADR-0036: Stable-key, completed-only exercise insight projection

Date: 2026-08-05

Status: accepted

## Context

The workout aggregate stores normalized exercise and set rows, and iteration 037 gave starter and owner-created exercises stable keys while preserving the display/tracking/equipment snapshot selected into each workout. The product could total a whole workout, but it could not answer a narrower question such as “what evidence has been recorded for this exact movement over the last month?”

Grouping by display name would merge unrelated owner identities and would break after a catalog rename. Counting planned or incomplete sets would present intention as achieved work. Persisting a second trend table would make correction and deletion consistency harder, while interpreting higher volume or a personal best as a progression instruction would cross the current safety boundary.

## Decision

1. Expose an owner-authenticated read projection at `GET /v1/insights/exercises/:exerciseKey`. The path accepts only the shared bounded stable-key grammar; display names are never query identity.
2. Read current, non-deleted relational workout rows. A workout correction replaces its current exercise/set graph and a soft deletion removes it from normal reads, so the projection recomputes without maintaining duplicate state.
3. Only sets with `completed = true` contribute repetitions, canonical load volume, duration or distance. A workout counts as an exercise session only when that exact key has at least one completed set. Total set count remains visible on a returned point so partial evidence is not hidden.
4. Calculate complete 7/30/90 elapsed-day summaries in PostgreSQL, anchored to a server reference instant. Return at most the latest 180 completed-evidence points from the 90-day window and set `hasMore` when the bounded detail list is truncated.
5. Keep every point's recorded exercise name, category, tracking mode, equipment and optional equipment note. The top-level identity is only a convenience copy of the newest returned snapshot; it does not reinterpret earlier rows through the current catalog.
6. Render each point's `localDate` in the requested valid IANA timezone. Ordering and window membership remain timestamp-based, while the local date is a display fact.
7. Require exercise keys to be unique within a newly accepted workout. The read query still groups by workout and chooses the first positioned snapshot defensively if pre-rule data contains duplicates. Add `(workout_id, exercise_key)` lookup support in migration `0024_exercise_insight_index.sql`.
8. Present the projection on a dedicated lazy “Exercise Observation” H5/WeApp page. The workout ledger links using the exact key; equal visible names receive a short key suffix in the selector. Each chart compares only one unit selected from the recorded tracking mode.
9. Do not persist trend output, calculate estimated strength, label a record “good/bad”, infer movement quality or generate automatic progression advice.

## Consequences

Users can inspect correction-safe, owner-isolated evidence for one stable movement without planned sets inflating completed work. Historical names and equipment remain honest snapshots, and deletion or replacement cannot leave a stale materialized aggregate.

The endpoint intentionally covers only the last 90 days and bounds detail to 180 points. Stable keys distinguish identities but do not claim two differently keyed movements are biomechanically different or equivalent. Any future alias migration, personal-record policy or progression recommendation requires a separate decision and safety evaluation.

The dedicated page adds a lazy H5 route. H5 total static assets therefore use a reviewed 1.85 MB ceiling, while the 320 KB entry, 200 KB asynchronous-route, 700 KB WeApp total and 45 KB WeApp page ceilings remain unchanged.

## Alternatives rejected

- Group by exercise name: merges different identities and breaks after rename.
- Count every recorded set: turns incomplete intention into completed evidence.
- Read immutable revision snapshots for the current trend: would count superseded/deleted states rather than the owner's corrected current record.
- Store a trend/materialized-view table now: duplicates sensitive facts and creates correction/deletion synchronization work without measured need.
- Embed the entire panel in the already-dense workout editor: exceeded the checked-in WeApp page-JavaScript budget and weakened information hierarchy.
- Show estimated one-repetition maximum or automatic load increases: unsupported for mixed movement types and outside the current general-observation safety boundary.
