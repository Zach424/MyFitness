# Workout record model

Status: implemented in iteration 005; server-authoritative completion hardened in iteration 032; explicit plan-session relationship added in iteration 036; user-owned exercise catalog and snapshot semantics added in iteration 037; stable-key exercise observation added in iteration 038; explicit occurrence editing added in iteration 043; conflict-safe correction recovery added in iteration 044

Workout records are user-owned observations of what was actually attempted and completed. They are not exercise prescriptions, readiness diagnoses or claims that greater volume is always better.

## Aggregate shape

```text
workout session
├─ title, start/end, IANA timezone
├─ status: completed | partial
├─ source: manual | imported
├─ pain 0–10, fatigue 1–5, optional note
└─ ordered exercises (1–30)
   ├─ catalog key, display name, category, tracking mode
   ├─ equipment list, optional equipment notes, optional exercise notes
   └─ ordered sets (1–50 per API contract)
      ├─ kind: warmup | working | cooldown
      ├─ reps and optional display load/unit
      ├─ duration and/or distance
      ├─ optional RPE 1–10
      └─ completed flag
```

The API accepts strength, cardio and mobility structures through one explicit set contract. A set must contain repetitions, duration or distance. Load and unit are paired, and a loaded set also requires repetitions. Exercise positions and stable exercise keys are unique within a session, and set positions are unique within an exercise.

`trackingMode` is one of `reps_load`, `duration` or `duration_distance`. Equipment uses a bounded vocabulary; `other` requires `equipmentNotes`. New clients send both fields explicitly. Older snapshots that predate iteration 037 remain readable through category-based client fallback, but that inference is not written back as new evidence.

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

The editor resolves separate local start/end minutes through one explicit IANA timezone. DST gaps and unresolved repeated minutes cannot submit; a repeated minute needs its UTC-offset choice. Both instants must be no later than now and end remains at or after start. If both create fields are blank, the client records a 45-minute session ending at submission; if one is blank, it derives the missing endpoint. Correction preserves each exact original instant while its displayed minute/zone/offset remains untouched.

Migration `0021_authoritative_workout_status.sql` backfills the relational status cache from persisted set flags without rewriting immutable revision history. API reads also derive current status from the loaded set graph, so a stale cache cannot become the response authority. Historical snapshots created before this rule remain original accepted evidence; every snapshot created after the hardening contains the server-derived status.

Migration `0023_user_exercise_catalog.sql` adds tracking/equipment snapshot columns to `workout_exercises`. These fields describe what the user selected when the workout was recorded; they are not joined to a current catalog definition at read time.

Migration `0024_exercise_insight_index.sql` adds `(workout_id, exercise_key)` lookup support for the read projection. It stores no duplicate trend data.

## Exercise catalog and history boundary

The active picker combines the versioned `starter-2026-08-05-v1` catalog with owner-created entries. A custom definition has a stable key, display name, aliases, category, tracking mode, equipment and optional equipment notes. Creation is idempotent, correction uses an expected revision, and archive removes the definition from active search while keeping immutable definition revisions.

Selecting an entry copies its visible semantics into the workout draft and then the saved exercise snapshot. Renaming, changing equipment or archiving the definition does not update an open draft or any stored workout. The workout `catalogKey` can support later grouping, but there is deliberately no live foreign key that grants a mutable directory authority over historical fact display.

## Exercise observation projection

`GET /v1/insights/exercises/:exerciseKey` groups by the exact stable key, never by display name. It reads only current, non-deleted workout rows. A corrected workout therefore contributes its latest relational graph, while soft deletion removes it from the projection without deleting immutable workout history.

Every metric is gated by `completed = true`. A workout counts as an exercise session only when that exact exercise has at least one completed set. Returned points still expose completed and total set counts, so partial evidence such as `2/3` remains visible without the third set affecting repetitions, canonical volume, duration or distance.

PostgreSQL returns full 7/30/90 elapsed-day summaries plus at most 181 recent rows from the 90-day window. The API emits the newest 180 and an explicit `hasMore` flag. Occurrence instants determine ordering/window membership; a validated IANA timezone produces each point's display `localDate`.

Each point carries its saved name, category, tracking mode, equipment and optional note plus the current workout revision. The response's top-level identity is only the newest point's convenience snapshot. Same-name different-key exercises remain separate, and a catalog rename cannot rewrite earlier point labels.

The client charts one unit at a time according to the newest recorded tracking mode and lists all completed-only metrics separately. The projection does not calculate estimated maximums, infer movement quality, label progress or prescribe load changes. See [ADR-0036](decisions/0036-stable-key-exercise-insights.md).

## Repeat-last semantics

“Repeat” copies exercise identity, order, set kind, reps, display load, duration, distance and RPE into a new draft. It deliberately resets:

- every `completed` flag;
- start/end time to blank/current-session behavior;
- pain, fatigue, note and prior server identity/revision.

This makes the previous workout a convenient structure template without presenting yesterday's completion, symptoms or notes as today's facts. Saving creates a new idempotent session; it never links by mutating or cloning the previous database row.

Repeat also copies the recorded tracking mode and equipment snapshot. It does not refresh the exercise from the current catalog, so a repeated draft remains visibly based on the earlier workout until the user selects another definition.

Correction drafts are distinct from repeat drafts. A correction retains the workout UUID and base revision and can be restored only after the current owner-visible list still reports that exact revision; stale/deleted targets are abandoned without a write. Saving a restored correction continues to send `expectedRevision`, while cancel/discard removes the local copy. Repeat drops all correction identity and creates a new session.

## Plan relationship

The workout aggregate contains no plan fields. A separate owner-controlled link records the exact workout revision that the user selected for an accepted plan session revision. This avoids changing workout request hashes or allowing an older full-replacement client to remove a relationship it cannot represent.

A later workout correction advances the workout aggregate normally while the link retains its original `workout_revision`; list projections expose both versions. Soft-deleting the workout closes every active link in the same transaction with `workout_deleted` as the reason. The workout and its immutable snapshots remain the authority for actual sets, status and summaries; the link cannot turn a partial workout into a completed one.

## Safety and product boundaries

- Pain at 6 or above triggers clear stop/escalation copy; the app does not diagnose injury.
- Volume is labeled as an observation aid, not a quality score or progression mandate.
- Imported workouts are allowed by contract for later adapters, but there is no import UI or provider integration yet.
- Rest intervals, tempo and supersets remain deferred; plan linkage is explicit and never inferred.
- Starter definitions and user-entered catalog fields are descriptive content, not coaching validation or a claim that an exercise is safe for a particular user.
- Privacy erasure remains separate from soft deletion and must cover revisions and backups before public release.
