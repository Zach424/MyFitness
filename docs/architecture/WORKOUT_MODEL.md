# Workout record model

Status: implemented in iteration 005

Workout records are user-owned observations of what was actually attempted and completed. They are not exercise prescriptions, readiness diagnoses or claims that greater volume is always better.

## Aggregate shape

```text
workout session
├─ title, start/end, IANA timezone
├─ status: completed | partial
├─ source: manual | imported
├─ pain 0–10, fatigue 1–5, optional note
└─ ordered exercises (1–30)
   ├─ catalog key, display name, category, optional notes
   └─ ordered sets (1–50 per API contract)
      ├─ kind: warmup | working | cooldown
      ├─ reps and optional display load/unit
      ├─ duration and/or distance
      ├─ optional RPE 1–10
      └─ completed flag
```

The API accepts strength, cardio and mobility structures through one explicit set contract. A set must contain repetitions, duration or distance. Load and unit are paired, and a loaded set also requires repetitions. Exercise positions are unique within a session and set positions are unique within an exercise.

## Facts and derived values

The client sends display values and completion evidence. The server computes:

- canonical load in kilograms (`kg` unchanged; `lb × 0.45359237`), rounded to four decimals;
- completed and total set counts;
- volume as the sum of `canonicalLoadKg × reps` for completed loaded sets, rounded to two decimals;
- distance and active duration from completed sets only.

Incomplete sets stay in the record so planned-versus-actual structure remains visible, but they never inflate volume, distance or active time. The database stores both display load/unit and canonical kilograms so history preserves what the user entered while summaries stay comparable.

`status` currently remains an explicit contract field, with the shared client deriving `completed` only when every set is complete and `partial` otherwise. Future imports must apply the same rule or document a versioned exception.

## Persistence and revisions

The current aggregate is normalized into `workout_sessions`, `workout_exercises` and `workout_sets`. This supports owner/time lists and later exercise-level analysis without parsing JSON. Each accepted create, replacement or deletion also appends a full JSON snapshot to `workout_revisions` in the same transaction.

Creation is protected by a per-user idempotency key and request hash. Replacement requires `expectedRevision`; a stale revision returns `409`. Deletion is soft deletion from normal lists and adds a final `deleted` snapshot. Owner history remains readable, while missing and cross-user targets both return `404`.

The JSON revision is intentionally immutable evidence, not a second writable source of truth. Current relational rows are rebuilt transactionally on replacement, and their database constraints repeat the main contract invariants.

## Repeat-last semantics

“Repeat” copies exercise identity, order, set kind, reps, display load, duration, distance and RPE into a new draft. It deliberately resets:

- every `completed` flag;
- start/end time to the current session;
- pain, fatigue, note and prior server identity/revision.

This makes the previous workout a convenient structure template without presenting yesterday's completion, symptoms or notes as today's facts. Saving creates a new idempotent session; it never links by mutating or cloning the previous database row.

## Safety and product boundaries

- Pain at 6 or above triggers clear stop/escalation copy; the app does not diagnose injury.
- Volume is labeled as an observation aid, not a quality score or progression mandate.
- Imported workouts are allowed by contract for later adapters, but there is no import UI or provider integration yet.
- Rest intervals, tempo, supersets, equipment, custom exercise library and plan linkage are intentionally deferred until the basic record loop is proven.
- Privacy erasure remains separate from soft deletion and must cover revisions and backups before public release.
