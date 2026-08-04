# Iteration 037 — User-owned exercise catalog

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 036 connected plan and actual workout revisions, but training entry still depended on a small fixed exercise list and category-based field inference. The bounded critical-path question for this round was whether an owner can define and safely reuse a movement with explicit tracking/equipment semantics without letting a later directory correction rewrite earlier training evidence.

Success requires a versioned starter catalog plus owner-created entries; searchable names/aliases/equipment; idempotent creation; optimistic correction; reversible archive with immutable history; strict cross-owner isolation; explicit tracking mode and equipment snapshots in workouts; unchanged saved workouts after catalog correction/archive; portable export and account-erasure coverage; OpenAPI, PostgreSQL, H5 and WeApp agreement; and the normal repository gates to remain green.

This round does not certify user-entered exercises, import a large third-party corpus, attach external images, diagnose movement quality, generate progression prescriptions, call a real provider or perform owner-operated cloud work.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` adds a dependency-free, versioned starter catalog; bounded tracking/equipment vocabularies; strict create/update/list/history contracts; and backward-compatible workout snapshot fields.
- Migration `0023_user_exercise_catalog.sql` adds owner catalog rows, immutable definition revisions, active-name/idempotency constraints and tracking/equipment snapshot columns on workout exercises.
- `apps/api/src/exercise-catalog` implements owner-scoped list/create/correct/archive/history operations. Per-owner row locking serializes mutations; request hashes protect idempotency; expected revisions protect corrections.
- `apps/api` workout persistence stores and maps the selected semantics. Privacy inventory counts custom catalog records with workouts, while `myfitness-portable-export-v3` includes active/archived definitions and revisions but excludes request hashes and idempotency keys.
- `apps/client` loads starter/custom definitions alongside workouts; searches name, aliases, equipment and notes; supports create/correct/archive; and snapshots a selected definition into the current draft. The ledger displays tracking/equipment facts from the workout, not from a live catalog lookup.
- OpenAPI, ADR-0035, workout/privacy/architecture models, design review, roadmap, README and project status describe the same lifecycle.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. The change adds no runtime dependency, paid service, external API, photo or new sensitive-data category.

## 3. Implementation method

### Separate reusable definitions from recorded facts

The custom catalog is a directory, not a historical source of truth. Its active row can change, so each accepted mutation appends an immutable revision. Selecting an entry copies `catalogKey`, display name, category, tracking mode, equipment and optional equipment notes into the draft and then the workout exercise row/snapshot. There is no live foreign key that can reinterpret an old workout after a rename or archive.

Older workout snapshots have no explicit tracking/equipment fields. The client keeps a read-only category fallback for those rows, while every new draft/request carries explicit semantics. Repeat-last preserves the prior workout snapshot rather than silently refreshing it from the current directory.

### Make ownership, retry and correction deterministic

An owner-scoped lock row serializes catalog mutations before checking active case-insensitive names and idempotency. Reusing an idempotency key with the same request returns the same definition; changing the request returns `409`. Correction locks the target row and requires its current revision. Cross-owner IDs are indistinguishable from missing IDs, and archive advances the revision instead of deleting data.

Database constraints repeat the bounded category/tracking/equipment/action vocabularies, require `other` equipment notes and keep active names unique per owner. The API limits the active custom list to 200 entries and combines it with the nine-entry starter version without copying starter content into PostgreSQL.

### Keep the editor explicit but compact

The workout page first loads workouts and catalog in parallel. Search covers display name, aliases, equipment labels and notes. The custom-definition sheet exposes category, one of three tracking modes and multi-select equipment; `其他` reveals a required note. Correction/archive copy tells the owner exactly which current or historical surfaces remain unchanged.

The H5 review found that Taro emitted `disabled="false"` on an enabled item. CSS `[disabled]` still matched the attribute and faded the button, even though it could be clicked. The final item uses an explicit selected class and omits the disabled attribute unless actually selected; Playwright now checks both enabled state and full opacity.

### Treat external content as a governed input

[free-exercise-db](https://github.com/yuhonas/free-exercise-db) is a useful 800+ exercise candidate and publishes an [Unlicense/public-domain repository license](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md). [wger](https://github.com/wger-project/wger) offers a mature open-source exercise platform, while [exercemus/exercises](https://github.com/exercemus/exercises) aggregates multiple sources. Their application/content licenses, per-entry attribution, images, language and taxonomies differ. No bulk data or media was copied this round; a future import must preserve provenance and pass license, localization, duplicate and content-safety review.

## 4. Validation evidence

- Focused contract/client validation passed 3 files / 12 tests, covering definitions, other-equipment notes, search and workout request snapshots.
- Strict TypeScript passed across all six product/shared workspaces; API/OpenAPI generation and API production build passed.
- Repository-wide unit validation passed 47 files / 212 tests.
- PostgreSQL integration validation passed 13 files / 54 tests. The new cases prove starter version, idempotent replay/mismatch, case-insensitive duplicate rejection, cross-owner isolation, explicit workout snapshots, stale correction, archive/history, inventory/export v3 and invalid `other` equipment rejection.
- Main H5 browser validation passed 25/25 and the separate OIDC suite passed 3/3, for a 28-case browser inventory. The new 390 × 844 flow creates a custom kettlebell movement, finds it by alias, records a workout, corrects the definition while the workout keeps the original snapshot, archives it and rechecks history with zero captured request/page/console errors.
- H5 and WeApp production builds passed. Client quality measured H5 `1,693,068` total bytes, `312,571` entry bytes and `190,183` largest async JavaScript; WeApp `671,876` total bytes, `18,915` vendor bytes and `39,180` largest page JavaScript. All remain below checked-in budgets with no forbidden validation-runtime markers.
- `pnpm audit:prod` passed the critical/high gate with 9 known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-037-user-exercise-catalog-mobile.png`.

## 5. Problems found and experience captured

- A directory definition and a recorded fact have different revision semantics. Snapshot the definition at recording time; never let a mutable lookup become display authority for history.
- Stable keys can support future grouping, but same display names must not merge owner-defined identities. Names are labels, not identity or safety truth.
- Optional backward-compatible fields need a one-way migration strategy: read legacy inference, write explicit new evidence, and never rewrite old immutable snapshots just to make them uniform.
- Idempotency and case-insensitive uniqueness race unless mutations serialize on a stable owner authority. Locking only the not-yet-existing name row cannot protect concurrent creation.
- Archive is the right directory removal behavior because workouts and privacy export can still reference the historical snapshot. Hard deletion would make custody explanation weaker.
- HTML boolean attributes are presence-based. Component frameworks may render `disabled="false"`; styling and browser assertions must test the actual DOM result, not only React state.
- Migration checksums detect even a trailing-newline change. The local `0022` drift was proved byte-for-byte to be only a removed final newline; exactly that one local checksum row was repaired before applying `0023`, without resetting or deleting application data. Committed migrations remain immutable from this point.
- External repositories are not interchangeable content packages. Repository license, per-entry license, image rights, attribution, localization and safety review must all be recorded before import.
- Inventory/export and account erasure are feature acceptance work for a user-owned catalog, not a later privacy cleanup.

## 6. Global state review, remaining risks and next step

The manual workout loop can now represent local equipment and owner terminology without sacrificing historical truth. This closes the largest fixed-catalog usability gap, but the starter content is still a small demonstration corpus and user-entered definitions are not coaching validation. Real screen readers/WeChat devices, licensed localized content, cloud custody, telemetry ownership, real identity/providers and policy review remain open.

Iteration 038 should stay locally reproducible and add exercise-level history/trend projection over stable catalog keys and completed-only evidence. It must retain each workout's recorded display/equipment snapshot, avoid merging different identities by name, show missing evidence instead of manufactured progress and never turn volume or a personal best into automatic progression advice. Managed deployment moves to iteration 039 because its account, budget, domain, identity, custody, telemetry and policy inputs require the user or designated owners.

## 7. References

- [Iteration 036 archive](036-explicit-plan-workout-link.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0005](../architecture/decisions/0005-structured-workout-aggregate.md)
- [ADR-0030](../architecture/decisions/0030-server-authoritative-workout-status.md)
- [ADR-0034](../architecture/decisions/0034-explicit-plan-workout-link.md)
- [ADR-0035](../architecture/decisions/0035-user-owned-exercise-catalog.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
