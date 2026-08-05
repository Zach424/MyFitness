# Iteration 074: Owner-definition revision-ledger read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the shared exercise/food `DefinitionRevisionLedger` as editor-scoped immutable audit-read authority. Acceptance requires a failed first history page to remain unknown, the exact definition and unsaved correction context to stay visible, an accepted newest-first prefix to survive continuation failure under a frozen-cursor receipt, and history failure not to revoke independently accepted correction, archive or parent-register authority.

The round adds no API/schema/database change, definition validation rule, persistent history cache, polling, background continuation, mutation replay or claims about movement safety/nutrient accuracy. Real identity tenants, managed infrastructure, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- The exercise and food catalog pages now delegate history target/items/cursor/busy/failure/request generation to the shared `useAggregateHistory` reader introduced in iteration 073.
- `DefinitionRevisionLedger` accepts the shared phase/failure contract and renders the same product-owned checking, failure, retained-prefix and accepted-empty states while preserving R-number rows and definition-specific labels.
- Opening a new-definition editor explicitly closes history state; opening an existing definition starts one bounded GET. Closing, save reconciliation and archive completion invalidate late results through the existing hook generation.
- History failure no longer writes raw API detail into page feedback and no longer shares state with correction/archive workbench recovery.
- A 390 × 844 artifact shows an offline action revision ledger surrounded by retained editor/register context. A 1440 × 1000 artifact shows ten food revisions, frozen continuation, unsaved correction input and active correction/archive controls.

## 3. Implementation method

### Reuse the structural audit reader

Exercise and food history responses both satisfy the shared page shape needed by the hook: an owner ID is supplied separately and the result contains immutable items plus a nullable cursor. No definition value or mutable form field enters the reader. The existing entry remains the target only long enough to bind the route UUID; the editor still owns the correction draft.

### Separate history authority from mutation authority

The owner register has already accepted the current definition and revision before edit can open. A history-only outage therefore disables only continuation. `保存纠正` and `归档/停用` remain subject to the established register-ready, busy, optimistic-revision and reconciliation guards, while local inputs stay editable. This avoids converting optional audit evidence into a global editor outage.

### Make every empty state earned

The ledger no longer maps catch to `[]`. Undefined items render checking or product-owned failure copy; only a successful empty response renders the explicit accepted-empty receipt. During a failed suffix read, ten R-number rows remain readable, the old continuation is visibly inactive and one retry uses the same cursor.

### Preserve focus and composition

The shared retry ID receives delayed H5 focus. The existing scroll margin keeps the receipt visible when failure follows a bottom-of-ledger control. Mobile composition intentionally includes the mutation controls and parent definition card; wide composition includes form evidence, retained rows and active save/archive so the independence claim is visually reviewable.

## 4. Validation evidence

- Repository-wide unit validation passed 72 files / 362 tests; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Two new real-service browser checks passed: action definition initial transport loss/retry, and food definition 10-row retained prefix after 503 before exact continuation to 12 while unsaved input persists.
- The complete action/nutrition subset passed 33/33. The complete main H5 browser suite passed 82/82 in 2.6 minutes; OIDC passed 3/3 after its dedicated build, so the repository now retains 85 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. The normal H5 tree was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,743,361 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 1,001,863, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-074-action-definition-history-offline-mobile.png` and `iteration-074-food-definition-history-stale-wide.png`.

## 5. Problems found and experience captured

- A successful-empty array must come from the service; assigning `[]` in a catch block converts uncertainty into false evidence.
- An audit history can fail without invalidating the current mutable aggregate. Read authority must follow the dependency graph, not the visual nesting of controls inside one editor.
- Retaining an unsaved correction during suffix failure proves two different things at once: the immutable prefix is still readable, and the draft remains owner intent rather than accepted history.
- One shared reader reduced WeApp output after removing duplicate page state even though importing the shared presentation into two H5 lazy routes increased total assets. Platform measurements can move in opposite directions.
- Focus assertions and activation assertions should be separated in browser tests. A focused recovery control can be activated directly after its state is proven; unrelated form submission must remain an independently tested path.
- Full browser runs overwrite historical screenshots with current fixture dates. Restore tracked evidence after regression and commit only the new iteration artifacts.

## 6. Global state review, remaining risks and next step

All five current aggregate/definition revision surfaces now distinguish unknown, accepted, in-progress and retained-stale evidence through one lifecycle. Definition histories remain owner-confirmed descriptive/reference evidence only; availability or revision count does not establish exercise safety, nutrient accuracy or advice.

The next local evidence gap is Week Fold's composed plan history. Its accepted plan snapshot already has page-level read authority, but an older plan-revision failure still falls back to raw page feedback while leaving the cursor apparently reusable, and plan decisions sit beside AI explanation history with a separate provenance boundary. Iteration 075 should label/freeze the accepted decision prefix, preserve the current plan and explanations without model regeneration, distinguish unread/confirmed-empty history and provide a bounded retry. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-074 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 073 archive](073-aggregate-revision-sheet-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0046](../architecture/decisions/0046-stable-definition-history-pagination.md)
- [ADR-0069](../architecture/decisions/0069-owner-definition-revision-ledger-read-authority.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
