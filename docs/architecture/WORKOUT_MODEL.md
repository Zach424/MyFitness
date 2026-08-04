# Workout record model

Status: implemented in iteration 005; server-authoritative completion hardened in iteration 032; explicit plan-session relationship added in iteration 036

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

`status` is a server-derived response fact. The domain rule returns `completed` only when at least one set exists and every persisted set is complete; every other accepted aggregate is `partial`. New clients omit the field from create/update requests. The API temporarily accepts an optional deprecated hint from older clients but ignores it for persistence, responses, idempotency equivalence and new revision snapshots. This lets later imports use the same aggregate endpoint without becoming a second authority.

## Persistence and revisions

The current aggregate is normalized into `workout_sessions`, `workout_exercises` and `workout_sets`. This supports owner/time lists and later exercise-level analysis without parsing JSON. Each accepted create, replacement or deletion also appends a full JSON snapshot to `workout_revisions` in the same transaction.

Creation is protected by a per-user idempotency key and request hash. Replacement requires `expectedRevision`; a stale revision returns `409`. Deletion is soft deletion from normal lists and adds a final `deleted` snapshot. Owner history remains readable, while missing and cross-user targets both return `404`.

The JSON revision is intentionally immutable evidence, not a second writable source of truth. Current relational rows are rebuilt transactionally on replacement, and their database constraints repeat the main contract invariants.

Migration `0021_authoritative_workout_status.sql` backfills the relational status cache from persisted set flags without rewriting immutable revision history. API reads also derive current status from the loaded set graph, so a stale cache cannot become the response authority. Historical snapshots created before this rule remain original accepted evidence; every snapshot created after the hardening contains the server-derived status.

## Repeat-last semantics

“Repeat” copies exercise identity, order, set kind, reps, display load, duration, distance and RPE into a new draft. It deliberately resets:

- every `completed` flag;
- start/end time to the current session;
- pain, fatigue, note and prior server identity/revision.

This makes the previous workout a convenient structure template without presenting yesterday's completion, symptoms or notes as today's facts. Saving creates a new idempotent session; it never links by mutating or cloning the previous database row.

## Plan relationship

The workout aggregate contains no plan fields. A separate owner-controlled link records the exact workout revision that the user selected for an accepted plan session revision. This avoids changing workout request hashes or allowing an older full-replacement client to remove a relationship it cannot represent.

A later workout correction advances the workout aggregate normally while the link retains its original `workout_revision`; list projections expose both versions. Soft-deleting the workout closes every active link in the same transaction with `workout_deleted` as the reason. The workout and its immutable snapshots remain the authority for actual sets, status and summaries; the link cannot turn a partial workout into a completed one.

## Safety and product boundaries

- Pain at 6 or above triggers clear stop/escalation copy; the app does not diagnose injury.
- Volume is labeled as an observation aid, not a quality score or progression mandate.
- Imported workouts are allowed by contract for later adapters, but there is no import UI or provider integration yet.
- Rest intervals, tempo, supersets, equipment and a custom exercise library remain deferred; plan linkage is explicit and never inferred.
- Privacy erasure remains separate from soft deletion and must cover revisions and backups before public release.
