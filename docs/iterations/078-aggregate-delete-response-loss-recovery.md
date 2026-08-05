# Iteration 078: Aggregate delete response-loss recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes body/recovery, workout and meal deletion resilient to a lost response. Acceptance requires a transport/5xx/unknown result to remain unresolved, an explicit 4xx refusal to terminate the attempt, one exact current-resource read before any repeat, owner-visible absence to synchronize removal without another DELETE, the same revision to require a new confirmation and a changed revision to invalidate the old intent.

The round adds no API/schema/database change, deletion idempotency claim, automatic/background replay, persistent request state, offline queue or physical-media deletion claim. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `aggregate-delete-recovery.ts` owns a dependency-free failure taxonomy and pure removed/unchanged/changed revision classifier.
- `AggregateDeleteRecovery` is one shared Taro receipt with polite atomic status semantics, explicit H5 keyboard activation and product-owned disabled/focus styling.
- Each record page retains only the unresolved aggregate and receipt in React memory, closes the destructive modal and freezes all delete triggers while the result is unknown.
- Existing exact-resource APIs and `includeExactRecord` update the accepted ledger without inventing a new read model or modifying history.
- Mobile and wide artifacts place the amber receipt directly above the still-visible target list, preserving each page's notebook/editor composition.

## 3. Implementation method

### Separate request failure from result evidence

Network markers, 408/425/429/5xx responses and unknown adapter errors produce `reconcile_required`; a non-retryable HTTP response produces `terminal`. Neither path reports success. The terminal action clears only the stopped attempt and returns to the target row; it does not issue a GET or DELETE.

### Move uncertainty outside the destructive modal

When DELETE throws, the modal closes and its trigger memory resets. The page renders a stable ledger receipt and focuses `核对当前记录`. Every delete trigger is disabled so neither the same aggregate nor another row can start a destructive request while one outcome remains unresolved. Reading, history and correction keep their separately accepted ledger authority.

### Reconcile one exact aggregate

The receipt calls only the existing owner-authenticated exact GET. A 404 removes the local row and focuses ledger refresh without replay. The same revision clears the receipt, retains the row and explains that another deletion requires a fresh explicit confirmation. A different revision replaces the row and terminates the old expected-revision intent. Another read failure retains a focused read-only retry.

### Accept full refresh as equivalent evidence

A user may choose the existing ledger refresh instead of the compact receipt. Only a successful complete ledger response clears delete recovery; failed refresh retains both the accepted page and unresolved receipt. No background polling is added.

## 4. Validation evidence

- Repository-wide unit validation passed 73 files / 374 tests, including six aggregate-delete authority/evidence cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- Three targeted real-service browser lifecycle checks passed. Health and meal deletion committed before the response was aborted, then exact GET returned 404 and each flow proved one DELETE. Workout aborted before commit, exact GET proved R2, and the second DELETE occurred only after a fresh explicit confirmation.
- The first complete main browser run passed 81/82; an unrelated existing food-definition history retry-focus assertion missed its delayed focus once. That exact test passed immediately in isolation, and a complete second main run passed 82/82 in 2.7 minutes. OIDC passed 3/3, retaining 85 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,780,536 bytes, entry 319,235 and largest async JavaScript 207,699; WeApp total 1,015,686, vendor 18,915 and largest page 56,044. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,782,000/1,017,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-078-delete-reconciliation-mobile.png` and `iteration-078-delete-reconciliation-wide.png`.

## 5. Problems found and experience captured

- An exception describes transport, not the durable result. Destructive recovery must seek evidence before offering another write.
- Closing the modal is safer than trapping an offline user inside it, but unresolved authority must remain visible outside the modal and continue to freeze destructive controls.
- One target receipt should freeze all deletes on the page; otherwise the single page-memory recovery slot could be overwritten by another aggregate.
- A 404 from a previously accepted owner row establishes absence only from the current authenticated ledger. Copy should not broaden that into object-storage or global-erasure claims.
- The same revision is not permission to replay automatically. It is evidence that a new, explicit confirmation can be offered.
- A different revision invalidates the old expected-revision intent even when the user still wants deletion.
- Expected 404 reconciliation produces a browser resource console entry; E2E acknowledges that exact status while still rejecting unrecognized browser errors.
- One historical focus assertion showed a single timing flake under the first full run. Isolated proof plus a complete green rerun was required; no unrelated production behavior was changed.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the two new iteration artifacts remain.

## 6. Global state review, remaining risks and next step

All three aggregate deletions now have reproducible read-first response-loss recovery. The evidence proves application-level owner-visible state on local H5, not physical radio loss, WeChat-device behavior or physical media erasure.

The next local correctness gap is aggregate correction response loss. Current optimistic concurrency prevents a silent overwrite, but the correction save control can still repeat PUT after an ambiguous response instead of reading the exact current aggregate and comparing the advanced revision plus every submitted field. Iteration 079 should add that reconciliation across all three editors without granting create-style idempotency or persisting the correction request. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-078 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 077 archive](077-destructive-record-dialog-focus-boundary.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0051](../architecture/decisions/0051-ambiguous-create-response-recovery.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0072](../architecture/decisions/0072-destructive-record-dialog-focus-boundary.md)
- [ADR-0073](../architecture/decisions/0073-aggregate-delete-response-loss-recovery.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
