# Iteration 079: Aggregate correction response-loss recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes body/recovery, workout and meal correction resilient to a lost PUT response. Acceptance requires the current save action to stop before any repeat, retention of the exact page-owned correction input, one exact current-resource read, success only when the revision advanced and every submitted field matches, unchanged-revision input preserved for a later explicit save, and changed current evidence exposed without overwriting either side.

The round adds no API/schema/database change, correction idempotency promise, automatic/background replay, persistent request state or offline queue. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `aggregate-correction-recovery.ts` owns a dependency-free failure taxonomy, pure revision classifier and explicit health/workout/meal submitted-field projections.
- Each editor retains only target ID, base revision, exact submitted request and draft signature in React memory. Its existing polite atomic save-status surface becomes the recovery receipt.
- The primary action changes to `核对保存结果` only while the draft, target and base still match. A draft mutation invalidates that action in the same render before asynchronous cleanup.
- Existing exact-resource APIs and `includeExactRecord` update the accepted ledger without a new read model or history mutation.
- Mobile and wide evidence keep the amber authority receipt adjacent to the retained input and accepted R1 ledger evidence.

## 3. Implementation method

### Separate a request exception from the durable result

Network markers, 408/425/429/5xx responses and unknown adapter errors require exact-read reconciliation; an explicit non-retryable response terminates the attempt. Neither path reports success, and correction never borrows create's idempotency-key language.

### Compare all submitted facts, not server-only calculations

Health comparison maps display value/unit back to the submitted value/unit and includes metric, source, status, occurrence and timezone. Workout comparison includes the ordered exercise/set graph, tracking/equipment semantics, source, start/end, timezone, pain, fatigue and optional note while excluding generated row IDs, canonical load and summary. Meal comparison includes type, title, source, ordered food snapshots and servings, occurrence, timezone and optional note while excluding item IDs and calculated nutrient summaries.

### Resolve three evidence states

An advanced matching revision proves the prior save reached current state and closes the editor. The same revision proves only that no committed result is visible, so the draft remains and another PUT requires a new explicit click. Any other revision/content combination refreshes the ledger row and editing base while preserving the draft for review; it never auto-saves.

### Keep missing targets from becoming creates

Owner-concealed 404 removes the stale row but keeps the correction editor visibly frozen until cancel. This prevents a retained correction from falling through to the create branch. Another exact-read failure keeps the recovery action and input in place.

## 4. Validation evidence

- Repository-wide unit validation passed 74 files / 380 tests, including six correction failure/evidence/projection cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- Three targeted real-service browser checks passed. Health and meal PUT committed before the browser response was aborted, exact R2 content matched and each flow proved one PUT. Workout PUT aborted before commit, exact GET proved R1 and the second PUT occurred only after a new explicit save.
- The complete main browser suite passed 85/85 in 3.0 minutes; OIDC passed 3/3, retaining 88 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,802,178 bytes, entry 319,236 and largest async JavaScript 207,699; WeApp total 1,027,824, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,804,000/1,029,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-079-correction-reconciliation-mobile.png` and `iteration-079-correction-reconciliation-wide.png`.

## 5. Problems found and experience captured

- Optimistic concurrency prevents silent overwrite but is not user-facing recovery: making the next click discover a 409 still repeats a request before reading evidence.
- “Version advanced” alone is insufficient. Another correction may have won, so success requires the complete submitted projection to match.
- Server-generated IDs, canonical values and calculated summaries are evidence, but not fields the user submitted. Comparing the request projection avoids both false mismatch and weakened content checks.
- A changed server row and an unsaved local draft are two legitimate states. Updating the comparison base must not replace the input.
- A missing correction target cannot safely fall back to the create branch; explicit cancel is required to establish a new-record intent.
- Passive cleanup alone leaves one render in which a stale callback can still exist. Deriving the active recovery from the current draft/target/base closes that race before the effect removes memory state.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the two new iteration artifacts remain.

## 6. Global state review, remaining risks and next step

All three aggregate corrections now have reproducible exact-read response-loss recovery. The evidence proves application-level local H5 behavior, not physical radio loss or WeChat-device behavior. The request remains page-memory-only and cannot resume after reload, by design.

The next local mutation gap is nutrition favorites. Their exact-key PUT is replace-style and DELETE can reconcile through the current favorite list, but current client failure handling can still leave an uncertain toggle looking like ordinary failure. Iteration 080 should add product-owned list reconciliation without mutating meal snapshots, replaying removal automatically or persisting a queue. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-079 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 078 archive](078-aggregate-delete-response-loss-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0042](../architecture/decisions/0042-conflict-safe-correction-drafts.md)
- [ADR-0051](../architecture/decisions/0051-ambiguous-create-response-recovery.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0073](../architecture/decisions/0073-aggregate-delete-response-loss-recovery.md)
- [ADR-0074](../architecture/decisions/0074-aggregate-correction-response-loss-recovery.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
