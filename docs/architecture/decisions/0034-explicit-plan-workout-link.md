# ADR-0034: Explicit, revision-bound plan-to-workout links

Date: 2026-08-04

Status: accepted

## Context

Weekly plans and workout records already had independent optimistic revisions and immutable histories, but the product could not say whether a recorded workout belonged to a planned session. Matching by title, date, duration or exercise overlap would turn a guess into adherence evidence. Embedding plan fields inside the workout aggregate would also let an older client silently remove a link when replacing a workout without knowing the new field.

## Decision

1. Store the relationship in a separate `plan_workout_links` table. One active row binds `plan_id`, `plan_revision` and `session_date` to `workout_id` and `workout_revision`; neither source aggregate is rewritten.
2. Create a link only after an authenticated owner explicitly selects a workout. The server requires the current accepted plan revision, an actual session on the selected date, the current workout revision, current profile/eligibility and current planning-impact evidence. Cross-owner resources return `404`; stale or conflicting revisions return `409`; draft/skipped/modified plans and empty days return `422`.
3. Enforce owner equality with composite foreign keys and enforce at most one active workout per exact plan session revision plus at most one active link per workout with partial unique indexes.
4. Keep the bound revisions immutable. A later workout edit is exposed as `currentWorkoutRevision` while `workoutRevision` remains the version the user selected. A regenerated plan does not migrate an earlier link to the new plan revision.
5. Unlink by closing the row with a timestamp, reason and revision instead of deleting it. Workout soft deletion closes an active link in the same transaction. The API returns a strict closure receipt because H5/Chromium treated a successful XHR `204` as `net::ERR_ABORTED`.
6. Project only active links into the weekly-plan list. The Week Fold and Today label an exact-revision link as recorded and otherwise keep the session planned; they never derive state from title, timestamps or exercise similarity.
7. Include all active and closed link rows in the owner’s portable plan export and inventory count. Account erasure removes them through the existing user cascade.

## Consequences

The product can display planned versus recorded state without manufacturing adherence or coupling two established aggregate lifecycles. Corrections remain possible and auditable, and alternate clients cannot bypass ownership or freshness checks.

The link says only that the user associated two records. It is not a score, proof of exercise quality or permission to adapt future load. `partial` workouts remain visible as partial actual records. Automatic matching, plan-derived workout creation and adaptive progression require separate product and safety decisions.

## Alternatives rejected

- Match title/date/duration automatically: creates unconfirmed adherence facts and fails for moved or renamed sessions.
- Add nullable plan fields to workout create/update: old full-replacement clients could silently unlink, and workout revisions would mix two aggregate responsibilities.
- Rewrite the plan payload with completion state: makes immutable plan history depend on later observations and creates projection drift.
- Hard-delete links: removes correction and custody evidence.
