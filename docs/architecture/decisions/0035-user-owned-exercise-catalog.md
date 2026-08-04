# ADR-0035: User-owned exercise catalog with immutable workout snapshots

Date: 2026-08-05

Status: accepted

## Context

The first workout editor used a fixed demonstration catalog and inferred whether an exercise expected repetitions, load, duration or distance from its category. Users could not name their own movements or state the equipment actually available to them. Replacing the fixed entries with a live mutable catalog reference would create a different problem: renaming or archiving a catalog entry could silently rewrite how an old workout is displayed or interpreted.

External exercise repositories can accelerate later content work, but their licenses, per-entry attribution, language quality, media custody and movement taxonomy differ. Importing a large English corpus before those questions are reviewed would expand the product boundary without improving ownership semantics.

## Decision

1. Keep a small, versioned starter catalog (`starter-2026-08-05-v1`) in dependency-free contract constants. Starter entries are product demonstrations, not a complete or clinically reviewed exercise database.
2. Store user-created definitions in `user_exercise_catalog_entries`, scoped by owner. Names are unique case-insensitively among active entries. Aliases, category, tracking mode, equipment and optional equipment notes are explicit fields.
3. Support three tracking modes (`reps_load`, `duration`, `duration_distance`) and a bounded equipment vocabulary. Choosing `other` requires a user-visible note rather than an opaque free-form enum value.
4. Protect creation with an owner-scoped idempotency key and request hash. Corrections require `expectedRevision`; stale writes return `409`. Every accepted create, correction or archive appends an immutable definition snapshot.
5. Archive instead of hard-delete. Archived entries disappear from the active picker but remain in revision history, portable export and account-erasure scope.
6. Snapshot display name, category, tracking mode, equipment and equipment notes into every workout exercise. A catalog correction or archive never rewrites a saved workout or its immutable revision. Older workout rows without the new fields remain readable through a legacy client fallback; every newly saved workout sends explicit semantics.
7. Do not create a live foreign key from workout exercises to the catalog. `catalogKey` is a stable selection identity carried into the fact snapshot, not authority to reinterpret history.
8. Include active and archived custom definitions plus their revisions in `myfitness-portable-export-v3`. Exclude idempotency keys and request hashes.
9. Defer bulk external-corpus import. Evaluate source license, attribution, localization, media rights, duplicates and safety/content review before adopting any candidate dataset.

## Consequences

Users can build a reusable movement vocabulary that reflects their equipment while historical workouts keep the exact semantics visible at recording time. Corrections are reversible and auditable, cross-owner access is hidden, and privacy export/erasure cover the new data category.

The starter catalog remains intentionally small. User-entered names, aliases and equipment are descriptive facts, not coaching validation or proof that a movement is safe for a specific person. Exercise-level trends can group by stable `catalogKey`, but any progression recommendation remains a separate safety decision.

## External source candidates reviewed

- [free-exercise-db](https://github.com/yuhonas/free-exercise-db) advertises 800+ exercises and an Unlicense/public-domain repository license. It is a promising structured candidate, but localization, images, attribution provenance and content review are still required.
- [wger](https://github.com/wger-project/wger) is an established exercise manager, but the application is AGPL and its content uses per-entry licensing/attribution semantics that require a separate integration decision.
- [exercemus/exercises](https://github.com/exercemus/exercises) aggregates data from multiple sources with per-entry licenses; importing it would require preserving and displaying those obligations.

## Alternatives rejected

- Keep only the fixed starter list: does not represent home gyms, rehabilitation variations or local naming.
- Store only a free-text exercise name in workouts: loses safe reuse, explicit tracking semantics and correction history.
- Reference a mutable catalog row from workout display: lets later edits rewrite historical facts.
- Hard-delete a custom definition: removes custody and correction evidence while old workouts can still contain its snapshot.
- Bulk-import an external dataset now: licensing, localization, image rights and content quality are not yet accepted release inputs.
