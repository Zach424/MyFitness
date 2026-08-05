# Iteration 080: Meal-favorite response-loss recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes meal-favorite replacement and removal resilient to a lost response. Acceptance requires an interrupted toggle to stop every favorite mutation before any repeat, one explicit current-list read, exact food-snapshot/default-serving evidence for PUT, key absence for DELETE, retained meal input/source selection and a fresh user action before any uncommitted mutation is tried again.

The round adds no API/schema/database change, favorite history, automatic/background replay, persistent command state or offline queue. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `favorite-recovery.ts` owns the dependency-free failure taxonomy, deep submitted-snapshot comparison and save/remove evidence classifier.
- The nutrition editor retains only operation, food key/name and the frozen PUT input in React page memory. No meal draft field enters recovery state.
- One amber polite/atomic receipt sits directly above the retained meal items. Its guarded action receives focus and freezes only favorite toggles; meal editing and save retain parent authority.
- The existing owner favorite-list endpoint is the sole reconciliation read. Its accepted result replaces only the favorite choices.
- The mobile evidence keeps the recovery authority, entered serving and calculated draft preview in one reading column.

## 3. Implementation method

### Separate request failure from favorite evidence

Network markers, 408/425/429/5xx responses and unknown adapter errors require reconciliation. An explicit non-retryable response terminates the attempt. Neither path claims that the favorite changed, and reconciliation never calls PUT or DELETE.

### Freeze the submitted replacement

Before PUT, the page constructs one exact food snapshot and default serving from the current draft row. Evidence comparison is deep and excludes server timestamps only; matching a food key alone cannot prove that an already present favorite contains the submitted values.

### Resolve list evidence by operation

A matching current entry proves save completion. A present entry with different content is divergent and becomes the accepted current favorite without changing the meal. Absence means the save is not visible. For removal, absence proves the owner-visible favorite is removed and presence means deletion is not visible. Both uncommitted outcomes close the receipt and require a later explicit toggle.

### Keep preference state out of meal facts

The reconciliation response updates the accepted favorite list while preserving meal title, items, servings, source tab and save authority. A failed list read retains the receipt and focus target. There is no polling, persisted recovery instruction or cross-route replay.

## 4. Validation evidence

- Repository-wide unit validation passed 75 files / 386 tests, including six favorite failure/equality/evidence cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- One targeted real-service browser scenario passed. PUT committed before the browser response was aborted, list reconciliation proved the exact saved snapshot with one PUT; DELETE was aborted before commit, the list proved the entry remained and a second DELETE occurred only after a new explicit toggle. Meal title, item, serving and source tab remained unchanged.
- The complete main browser suite passed 86/86 in 2.8 minutes; the correctly sequenced OIDC build/suite passed 3/3, retaining 89 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,808,130 bytes, entry 319,237 and largest async JavaScript 207,699; WeApp total 1,034,512, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,810,000/1,036,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-080-favorite-reconciliation-mobile.png`.

## 5. Problems found and experience captured

- Replace-style PUT is storage-idempotent by key but not proof-equivalent to replay: a changed draft serving could overwrite the already committed snapshot. Read evidence remains the safer first action.
- Favorite-list presence alone is insufficient for save recovery. The complete user-submitted food snapshot and default serving must match.
- DELETE has no request identity. Presence after an interrupted call permits only a new explicit intent; absence resolves current owner-visible state without another deletion.
- Preference reconciliation and meal facts are separate authorities. Updating favorites must not rewrite the current meal snapshot, calculated nutrients or source selection.
- Freezing every favorite control prevents a second mutation from invalidating the list evidence while leaving unrelated meal work available.
- The OIDC suite requires its dedicated build before browser execution; running the suite against a standard development-login build produces expected route/control failures rather than identity evidence.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration artifact remains.

## 6. Global state review, remaining risks and next step

Meal favorites now have reproducible list-based response-loss recovery without changing their independent snapshot boundary. The proof establishes application-level local H5 behavior, not physical radio loss or WeChat-device behavior. Recovery is deliberately page-memory-only and cannot resume after reload.

The next local mutation gap is profile/goal replacement. Its current 409 path reads a known conflict, but a lost successful PUT response can still invite another write before current evidence is checked. Iteration 081 should retain the exact submitted projection/base revision, compare one current profile read and preserve unsaved input without silently rebasing risk or consent facts. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-080 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 079 archive](079-aggregate-correction-response-loss-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0006](../architecture/decisions/0006-nutrition-snapshot-aggregate.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0074](../architecture/decisions/0074-aggregate-correction-response-loss-recovery.md)
- [ADR-0075](../architecture/decisions/0075-meal-favorite-response-loss-recovery.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
