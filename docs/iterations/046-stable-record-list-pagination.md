# Iteration 046 — Stable record-list pagination

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The health, workout and meal list routes were bounded but silently truncated at 100, 50 and 50 rows. Older current aggregates were inaccessible, and correction-draft restore incorrectly depended on the target being present in that first response. This round makes all current aggregates progressively reachable without loading an account's full record collection on every editor open.

Success requires strict shared pagination contracts; compatible no-query defaults; deterministic owner ordering; a cursor that carries no health values or chronology; continuation after anchor correction/deletion; rejection of malformed, foreign and cross-resource cursors; exact owner-only current reads; indexed PostgreSQL queries; 20-item client pages with explicit load-older controls; duplicate-safe merges; and correction recovery beyond the first page.

This round adds no cloud service, external provider, dataset, full-text search, total-count query, medical behavior or pagination to immutable revision histories.

## 2. Structure, technology and design state

- `packages/contracts/src/pagination.ts` owns the base64url cursor boundary and strict limit/cursor query factory. Health, workout and nutrition contracts each expose their paged response and compatible default/max limit.
- `apps/api/src/pagination/record-page-cursor.ts` owns the versioned UUID/revision cursor codec. The three aggregate services recover sort boundaries from immutable owner revisions, apply keyset predicates and return `limit + 1` evidence as `nextCursor`.
- `infra/postgres/migrations/0026_record_list_pagination_indexes.sql` aligns the three partial current-row indexes with occurrence time, creation time and UUID descending.
- The three controllers expose documented query parameters plus exact current-resource `GET` routes. Missing, deleted and cross-owner exact reads remain indistinguishable as `404`.
- `apps/client/src/lib/record-pages.ts` owns append-only UUID de-duplication and inclusion of an exact correction target. The three editors initially request 20 rows, show a loaded count and load older pages only on user action.
- Shared global pagination-control styles replace three page-local copies. The committed bundle budget records the reviewed net cost.
- The OpenAPI document, ADR-0044, architecture, three aggregate models, API guide, design review, roadmap, README and global status describe the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, parameterized PostgreSQL 18, Vitest and Playwright. No runtime dependency was added; one additive/index-replacement migration was added.

## 3. Implementation method

### Keep the cursor opaque and revision anchored

The cursor serializes only `{ v: 1, id, revision }` as base64url. The API validates exact keys, version, UUID and positive revision before querying. It then looks up that exact owner revision in `health_record_revisions`, `workout_revisions` or `nutrition_meal_revisions` and obtains the immutable occurrence and aggregate-creation timestamps. The list continues with the tuple predicate `(occurrence, created_at, id) < (anchor...)` and the same descending order.

Because the boundary comes from the revision present when the page was returned, later correction of the occurrence time cannot move the cursor. Because old revisions survive soft deletion, deleting the anchor cannot erase the boundary. The cursor is not an authorization token; the authenticated owner is checked both when resolving it and when reading the next page.

### Preserve compatibility while making older data reachable

No-query callers retain the previous 100-row health and 50-row workout/meal behavior, now with `nextCursor`. Editors deliberately request only 20. Each continuation appends unseen aggregate UUIDs and leaves current ordering intact. No exact total is calculated.

An exact owner-only read was added for each aggregate. Correction restore fetches that UUID, compares its current revision with the draft's base revision and only then restores the form. A stale revision or deleted target clears the draft without writing; a race after restore still reaches the existing `expectedRevision` conflict guard.

### Treat package growth as a measured change

The first production measurement exceeded the iteration-045 ceilings. Moving identical load/end styles from three lazy pages into one global rule and simplifying query-string construction removed about 1.2 KB from H5 and 0.7 KB from WeApp. The remaining functional increase was reviewed, then ceilings moved narrowly to 2,440,000 H5 total, 207,000 H5 async, 801,000 WeApp total and 49,000 WeApp page bytes. Entry/vendor ceilings stayed unchanged.

## 4. Validation evidence

- Focused pagination/aggregate contract, cursor and client-merge validation passed 6 files / 23 tests.
- The dedicated PostgreSQL pagination integration passed 1/1. It covers owner ordering, correction of the health anchor, deletion of the workout anchor, complete meal traversal, exact reads, cross-owner concealment, cross-resource cursor rejection and invalid limits.
- Repository-wide unit validation passed 61 files / 268 tests.
- PostgreSQL integration validation passed 19 files / 61 tests.
- Strict TypeScript passed across all six product/shared workspaces; committed OpenAPI generation and repository formatting passed.
- Main H5 browser validation passed 38/38 and dedicated OIDC passed 3/3, for 41 browser cases. The new case creates 21 health records, proves the 20-row first page and older continuation, then restores a correction draft for the record outside the first page through the exact route.
- API, H5 and WeApp production builds passed. Client quality measured H5 `2,434,627` total bytes, `318,996` entry bytes and `205,992` largest async JavaScript; WeApp `799,592` total bytes, `18,915` vendor bytes and `48,204` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-046-progressive-history-mobile.png`.

## 5. Problems found and experience captured

- The prior archive called the editor lists unbounded. Source audit corrected that: the server work was capped, but the cap was silent and made older data unreachable. Performance and reachability must be checked independently.
- An offset is not a stable position when users can correct occurrence times. A versioned immutable revision is a durable pointer to the ordering boundary that the user actually saw.
- A cursor should carry the minimum locator, not sensitive sort facts. The server can recover timestamps from already-retained immutable owner evidence.
- Cursor stability after deletion requires resolving against revision history rather than the current table.
- Correction recovery and list browsing have different access patterns. An exact owner read avoids enlarging every list page to support a rare old-draft case.
- The existing stale-meal browser test intercepted the old whole-list recovery call. Updating it to mutate the exact read made the test match the new behavior and continue proving safe refusal.
- A bundle ceiling should first trigger de-duplication, then move only against measured, documented product value.

## 6. Global state review, remaining risks and next step

All current health, workout and meal aggregates are now reachable through bounded owner pages, and correction recovery no longer mistakes an off-page aggregate for deletion. Current-list transport is bounded, but the per-aggregate immutable revision-history routes still return every revision at once. A frequently corrected long-lived record can therefore grow an unbounded response and history sheet.

Iteration 047 should add stable bounded pagination to the health, workout and meal revision-history endpoints and progressive history-sheet loading, while preserving deleted-aggregate access, immutable ordering, owner concealment and existing action labels. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 045 archive](045-timezone-safe-history-calendar.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API contract guide](../api/README.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0042](../architecture/decisions/0042-conflict-safe-correction-drafts.md)
- [ADR-0043](../architecture/decisions/0043-timezone-safe-history-calendar.md)
- [ADR-0044](../architecture/decisions/0044-stable-record-list-pagination.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
