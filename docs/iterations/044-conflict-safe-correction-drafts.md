# Iteration 044 — Conflict-safe correction-draft recovery

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The owner-scoped 24-hour vault recovered unsaved new entries, but a refresh during correction still lost work. This round extends recovery to health-record, meal and workout corrections without allowing a local copy to outrank current server state.

Success requires exact aggregate/base-revision binding; no draft on merely opening an editor; explicit restore/discard; current-version recheck before restore; stale/deleted refusal; retry after verification failure; normal optimistic conflict behavior after restore; save/cancel/logout/erasure clearing; strict payload minimization; cross-platform production budgets; and browser proof across all three editors.

This round adds no server draft, lock, API/database shape, cloud service, provider or medical behavior.

## 2. Structure, technology and design state

- `apps/client/src/lib/correction-draft.ts` owns the exact target guard, target construction and current-revision lookup.
- Record, nutrition and workout draft models add one optional `{ aggregateId, baseRevision }` field. Edit mapping adds it; repeat/create mapping omits it; request builders ignore it.
- The three pages compare edits against their server-derived baseline, keep autosave active during correction and re-list the authenticated owner collection before restoration.
- `LocalDraftNotice` reuses the existing `LOCAL / 24H` component with correction-specific title, explanation, revision label and actions; aggregate IDs remain invisible.
- Existing vault keys, contract version, owner scope, expiry, size limit and clear-all privacy lifecycle remain unchanged.
- ADR-0042, architecture, three aggregate models, privacy/design notes, roadmap, README and global status describe the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, platform application storage, existing authenticated list endpoints, Vitest and Playwright. No runtime package, external data source or migration was added.

## 3. Implementation method

### Treat a correction draft as intention, not authority

Starting correction derives a form from one current aggregate and records only its UUID/revision beside the whitelisted fields. The dirty check compares against that exact derived form, so opening and closing an unchanged editor does not create sensitive local state. Repeat flows explicitly remove identity and remain new-entry operations.

On reload the page does not silently hydrate. The user sees the base revision and chooses Restore or Discard. Restore first calls the normal owner-list endpoint. The client accepts only an item with the same ID and revision, then uses that freshly returned aggregate as the editing target. A missing or different revision clears the obsolete copy and states that the current record was not overwritten. A failed network check keeps the copy for retry.

The recheck is not a lock. Update still sends the current editing target's `expectedRevision`, so a server change between recheck and save produces the established `409` conflict. No correction metadata crosses the write contract.

### Preserve the existing privacy lifecycle

The structural guard accepts exactly two correction keys, a UUID and positive integer. Owner identity stays in the envelope/server session rather than the payload. Photos, authorization data, erasure secrets, request keys and AI candidates remain excluded. Successful save, cancel/discard, logout and erasure initiation use the existing clear path.

### Review bundle growth as part of the feature

The change adds logic and explicit copy to three lazy editors. Initial production measurement exceeded the deliberately tight prior ceilings by 7,257 H5 total bytes, 2,010 largest-async bytes, 6,487 WeApp total bytes and 1,718 largest-page bytes. The new source is dependency-free and contains no validation-runtime regression; entry and vendor bundles did not grow. Reviewed ceilings therefore move only on affected dimensions to 2.29 MB / 203 KB for H5 total/async and 780 KB / 48 KB for WeApp total/page. Exact measurement remains below every gate.

## 4. Validation evidence

- Focused correction/draft/page-model validation passed 6 files / 27 tests. Exact target, malformed/expanded metadata, current/stale/missing lookup, edit/repeat mapping and request exclusion are covered.
- Repository-wide unit validation passed 56 files / 254 tests.
- PostgreSQL integration validation passed 17 files / 59 tests.
- Strict TypeScript passed across all six product/shared workspaces; repository formatting passed.
- Main H5 browser validation passed 36/36 and dedicated OIDC passed 3/3, for 39 browser cases. Health correction restores R1 and saves R2; meal correction refuses a simulated R2 server target for an R1 draft; workout correction restores R1 and cancel clears it. Existing logout/erasure cases still clear all draft keys.
- H5 and WeApp production builds passed. Client quality measured H5 `2,287,257` total bytes, `318,290` entry bytes and `202,010` largest async JavaScript; WeApp `776,487` total bytes, `18,915` vendor bytes and `46,718` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-044-correction-draft-mobile.png`.

## 5. Problems found and experience captured

- A locally valid edit is not necessarily current. Recovery needs a fresh server revision check, while the write still needs optimistic concurrency because recheck and save are separate moments.
- The owner must come from the authenticated server boundary, not from payload metadata. Binding an ID/revision is enough to identify editing intent without duplicating identity or a server snapshot.
- A transient verification failure and a proven stale target require opposite actions: keep for retry versus clear to prevent misleading recovery.
- Taro H5 wraps stored values as `{ data: string }` in raw browser `localStorage`. Browser tests that inspect storage must decode the platform wrapper before asserting the inner security contract.
- A visible “saved locally” state is not sufficient evidence of persistence. The browser test checks the actual envelope, reload behavior and final key removal.
- Tight bundle gates turn user-facing safety copy and repeated page control flow into measurable product cost. A reviewed small ceiling change is preferable to hiding checks or extracting an opaque abstraction solely to satisfy the previous number.

## 6. Global state review, remaining risks and next step

All three primary editors now recover both create and correction work without weakening ownership or revision guarantees. Application-storage encryption/shared-device/backup behavior and real WeChat runtime proof remain release risks. The local correction check cannot prevent a later race; the API's `409` remains intentional and must stay visible.

The next locally verifiable product gap is fragmented backfill/history navigation. Iteration 045 should add one timezone-safe cross-domain calendar over current body, meal and workout occurrence facts, keep missing days explicit and offer past-date entry points through the existing occurrence controls. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 043 archive](043-explicit-occurrence-time.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0040](../architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [ADR-0041](../architecture/decisions/0041-explicit-occurrence-time.md)
- [ADR-0042](../architecture/decisions/0042-conflict-safe-correction-drafts.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
