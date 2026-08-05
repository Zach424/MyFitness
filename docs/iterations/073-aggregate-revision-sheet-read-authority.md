# Iteration 073: Aggregate revision-sheet read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the body/recovery, workout and meal revision sheets as one immutable audit-read authority. Acceptance requires the requested aggregate to remain visible when its first page fails, unread evidence to differ from a successful empty response, loaded newest-first revisions to remain readable after continuation failure under a bounded stale receipt, the retained cursor to freeze and one focused product-owned retry to restore the failed read.

The round adds no API/schema/database change, history refresh button, persistent audit cache, polling, background continuation, mutation retry or health interpretation. Real identity tenants, managed infrastructure, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `aggregate-history-read.ts` defines five phases, two read operations, four failure families and purpose-bound copy without React or Taro dependencies.
- `use-aggregate-history.ts` owns one target, accepted prefix, cursor, request generation and exact initial/continuation retry contract. Close, parent refresh and unmount invalidate late results.
- `AggregateHistoryReadState` and `AggregateHistoryEmptyState` provide a shared ruled receipt, explicit accepted-empty state, frozen-prefix count and stable H5 retry target across all three sheets.
- The health, workout and meal pages no longer mix current-ledger `loadingMore` with audit pagination or push raw history errors into page feedback.
- A 390 × 844 artifact shows an initially offline workout history preserving its title and unknown boundary. A 1440 × 1000 artifact shows ten health revisions retained above a frozen continuation after a 503 response.

## 3. Implementation method

### Preserve target before evidence

Opening a sheet stores the owner-visible aggregate before issuing the first GET. Items remain `undefined`, rather than an empty array, until a successful response arrives. Failure therefore leaves the sheet, title and close action intact while withholding version rows and terminal copy. A returned empty array uses a separate service-confirmed empty receipt.

### Keep immutable rows, freeze the cursor

Continuation appends only after a successful response. While loading, the accepted prefix remains mounted with a count receipt. If the suffix read fails, the prefix stays readable, the old continuation button remains visibly disabled and `RETAINED n REVISIONS · CURSOR FROZEN` defines the exact page-memory boundary. Retry uses that same cursor and cannot advance it twice.

### Isolate lifecycles and focus

Every request captures a generation token. Opening another aggregate, closing the sheet, refreshing the parent ledger or unmounting invalidates any late result. History uses its own busy state, so closing a failed sheet does not freeze parent record mutations. Stable retry IDs receive delayed H5 focus; an explicit scroll margin prevents a focused continuation recovery from clipping the entire failure receipt.

### Measure the shared abstraction

The state model and hook are intentionally shared because the three sheets have the same lifecycle and already live in loaded recording routes. Relative to iteration 072, measured H5/WeApp totals grow by 22,742/7,087 bytes while H5 entry/largest async JavaScript and WeApp vendor/largest page remain unchanged. Only total budgets move to the next measured boundary.

## 4. Validation evidence

- Focused aggregate-history model validation passed 2/2; repository-wide unit validation passed 72 files / 362 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Two new real-service browser checks passed: requested workout retained through initial transport loss/retry, and ten accepted health revisions retained after 503 before exact continuation to twelve.
- The complete main H5 browser suite passed 80/80 in 2.5 minutes. After the required OIDC-specific H5 build, its dedicated suite passed 3/3; the repository now retains 83 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,736,743 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 1,003,905, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-073-workout-history-offline-mobile.png` and `iteration-073-health-history-stale-wide.png`.

## 5. Problems found and experience captured

- Keeping immutable rows is not enough: a retained cursor needs an explicit frozen boundary or the continuation control still implies current authority.
- `undefined` and `[]` carry different evidence. The first means no accepted read; the second may only follow a successful empty response.
- A history request belongs to the sheet, not the parent ledger. Separate busy and failure state prevents an audit outage from contaminating record creation/correction authority after close.
- Request generation protects both late-close and aggregate-switch races without introducing cancellation-specific platform code.
- Focus recovery after a failed bottom-of-list action can preserve keyboard location while clipping the new receipt. Scroll margin is part of the error-state composition, not screenshot-only adjustment.
- OIDC browser tests consume a dedicated build configuration. Running them against a normal H5 tree correctly exposes the development-login route; validation must rebuild OIDC immediately before that suite and restore normal H5 afterward.
- Shared source can increase total multi-route output even when entry and largest async route do not move. Total ceilings must follow measured production trees, not source-line intuition.
- Full browser runs overwrite historical screenshots with current fixture dates. Restore tracked evidence after regression and commit only the new iteration artifacts.

## 6. Global state review, remaining risks and next step

The primary health/workout/meal audit sheets now match their parent ledgers and the cross-domain calendar in separating unknown, accepted, in-progress and retained-stale evidence. Immutable revision rows remain facts; the client never diagnoses changes, assigns correctness or makes a stale cursor actionable.

The next local evidence gap is the shared exercise/food `DefinitionRevisionLedger`. Its initial history failure currently becomes an accepted empty array with raw page feedback, while continuation failure retains rows without a frozen-prefix receipt. Iteration 074 should preserve the owner definition and unsaved correction context, distinguish unread from successful-empty, retain immutable definition revisions after continuation failure and keep save/archive plus parent-register authority independent. The Week Fold plan/AI history composition should follow in iteration 075. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-073 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 072 archive](072-history-calendar-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0068](../architecture/decisions/0068-aggregate-revision-sheet-read-authority.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
