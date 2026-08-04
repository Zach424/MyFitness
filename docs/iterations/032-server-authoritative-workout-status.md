# Iteration 032 — Server-authoritative workout completion

Date: 2026-08-04

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 031 closed the privacy-first progress-photo gap. The next bounded local risk was a workout data-integrity inconsistency: the primary client derived status correctly, but the API contract still required every caller to declare `completed` or `partial`. A future import or a stale client could therefore persist a completed session with incomplete sets.

This round makes set flags authoritative without adding an import connector. Success requires new clients to omit workout status; legacy clients to remain accepted but unable to control it; the API to return and store `completed` only when every persisted set is complete; idempotent creation to ignore a changed legacy hint; current rows to be backfilled; new immutable snapshots to contain the derived state; OpenAPI and architecture to state the boundary; and focused, full, migration and real-browser checks to pass.

The round does not change completed-only volume/distance/duration math, rewrite old immutable snapshots, add provider data, infer whether an exercise was performed correctly or turn workout completion into a quality score.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts/src/workout.ts` makes the request status hint optional and describes it as deprecated compatibility input; response status stays required.
- `packages/domain/src/workout.ts` owns the single `completedSets === totalSets && totalSets > 0` status rule alongside existing aggregate calculations.
- `apps/api/src/workouts/workouts.service.ts` derives status before create/update, excludes the ignored hint from new idempotency hashes, accepts the exact legacy hash during replay and derives current responses from the loaded graph.
- `infra/postgres/migrations/0021_authoritative_workout_status.sql` backfills the relational cache from set facts and documents the column semantics.
- `apps/client/src/pages/workouts` stops sending status and adds one muted line explaining how the server generates the visible ledger state.
- contract/domain/client/schema-drift tests, PostgreSQL integration coverage and the committed OpenAPI document exercise the compatibility and authority boundary.
- ADR-0030, workout/architecture models, design review, roadmap, risk review, README and project status record the change.

Technology remains the existing TypeScript/Zod shared contract, deterministic domain package, NestJS/PostgreSQL modular API, Taro/React multi-end client and Vitest/browser validation stack. No dependency, external service, dataset or paid model was introduced. External repository research was unnecessary because this is an internal aggregate invariant with no missing catalog or algorithm source.

The design change is intentionally quiet. The existing evidence-sheet UI now says that all checked sets produce `已完成` and any unchecked set produces `部分完成`. It uses muted helper typography rather than a new badge, color or score; completed-only summary values remain the dominant preview.

## 3. Implementation method

### Derive once beside the existing workout calculation

`calculateWorkout` already traversed every set to count completed and total sets. It now returns the status from those same counters, avoiding a second client/server algorithm and handling an empty defensive input as `partial`. The API calculates the value before the session insert/update and new snapshot, while response mapping recalculates from loaded sets so the database cache cannot silently override facts.

### Keep old clients compatible without preserving authority

The Zod request field is optional rather than immediately forbidden. New client requests omit it. If an older caller sends the opposite value, parsing succeeds but service persistence ignores it. New create hashes remove only this compatibility hint, so replaying the same workout with `completed`, `partial` or no hint is semantically identical after the first new write. The service also accepts the exact pre-change raw-input hash when resolving an older idempotency row.

This is a compatibility window, not a second rule. Removing the hint entirely later requires evidence that supported clients no longer use it.

### Correct current cache without rewriting history

Migration 0021 groups each current session's persisted sets and writes `completed` only for a non-empty all-true group. It deliberately does not touch `workout_revisions`: those rows are immutable evidence of what the old system accepted. Every revision created after this round stores the server-derived status, and current API reads always derive from the current graph.

## 4. Validation evidence

- Migration runner applied/verified all 21 checksum-protected migrations.
- Focused contract, domain, client-model and schema-drift validation passed 4 files / 26 tests; strict TypeScript passed across all six product/shared workspaces.
- Workout PostgreSQL integration passed 1 file / 2 tests. It creates a partial session without a status field, replays it with a contradictory `completed` hint, verifies the stored/listed result remains `partial`, then updates all sets while sending `partial` and verifies database, response and new history become `completed`.
- OpenAPI regeneration makes request status optional with an explicit deprecated-compatibility description while keeping response status required.
- In-app H5 browser validation dismissed the known Taro dependency warning layer, saved a real `3/3 · 360 kg` session and a real `2/3 · 240 kg` session through the restarted API, and observed `已完成` and `部分完成` in the ledger together with the new authority explanation.
- Final repository-wide validation passed 43 files / 178 unit tests and 12 files / 50 integration tests. Formatting and strict TypeScript passed; production H5 and WeChat Mini Program builds completed with only the registered Taro dynamic-import, cache and bundle-size warnings. No external API or cloud service was involved.
- The authoritative project status was copied and independently verified byte-for-byte in the configured Obsidian vault. Iteration 031 and 032 knowledge archives were also mirrored under `10_Projects/MyFitness/iterations` with matching SHA-256 digests.

## 5. Problems found and experience captured

- The inconsistency was not in the main client algorithm; it was at the trust boundary. A correct UI does not make a caller-declared derived field safe for future imports or alternate clients.
- Removing the field outright would have turned a correctness hardening into an avoidable client-breaking change. Optional ignored input provides a measurable migration window while the response remains stable.
- Idempotency required separate treatment. Ignoring status for persistence but hashing it would still make a changed non-authoritative hint produce a conflict, so semantic authority and replay identity now match.
- Backfilling current rows is safe, but rewriting immutable snapshots would destroy evidence of earlier accepted states. Current projections and new history can be corrected without falsifying old history.
- The documented readiness endpoint is `/v1/health`, not `/v1/health/ready`; the restarted API was healthy while the first local poll used the wrong path. Checking registered routes separated a probe mistake from a service failure.
- The Taro development warning iframe intercepted the first browser click. Scoping to its frame and dismissing it restored the actual page flow; this remains a known dependency warning rather than a product error.

## 6. Global state review, remaining risks and next step

The project no longer carries the risk that API callers can set a workout status contradicting the set graph. Imported sources remain disabled until provenance and provider verification exist, but when added they will reuse the same server rule. Existing open release risks remain: starter exercise/food catalogs, provider and cloud custody, bundle size, accessibility, real identity, telemetry ownership and plan freshness.

Iteration 33 should make stale weekly-plan state proactive. The client currently learns about some revision/eligibility drift only when a server decision fails. The next local round should surface that state before commitment, explain the evidence change, offer a bounded reload/regenerate path and keep the server as authority. Owner-operated deployment, real identity/provider credentials and policy filings remain parked but mandatory.

## 7. References

- [Iteration 031 archive](031-progress-photo-assistance.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [ADR-0030](../architecture/decisions/0030-server-authoritative-workout-status.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
