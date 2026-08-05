# Iteration 087: Consent-history request lifecycle

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round makes panel visibility and parent/component lifecycle explicit authority for consent-history reads. Acceptance requires collapse, unmount and parent disablement to invalidate late initial/refresh/continuation results; no hidden failure or retry focus may appear; explicit reopen must issue a fresh request for the interrupted operation and exact cursor; a newer accepted result must survive an older success or failure.

The round changes one client component, its dependency-free authority model, browser coverage and the smallest required H5 total budget. It adds no API, contract, migration, persistent cache, polling, background replay, health interpretation, cloud service or external provider.

## 2. Structure, technology and design state

- `consent-receipt-history.model.ts` now owns the pure generation/open/mounted/enabled commit predicate, with direct unit coverage.
- `consent-receipt-history.tsx` retains a monotonic generation, one active request descriptor and one minimal interrupted operation/cursor descriptor in React refs.
- Collapse invalidates before hiding; explicit reopen consumes the interrupted descriptor once. Unmount and loss of parent authority discard both active and interrupted authority.
- `privacy.spec.ts` adds a 390 × 844 real API race that deliberately lets an old empty first page and an old 503 continuation settle after newer requests win.
- The iteration-086 large-text harness now doubles four history-owned CSS variables rather than Taro's root font. Its screenshot was regenerated, and the ordinary iteration-087 screenshot confirms normal density.

## 3. Implementation method

### Separate request existence from commit authority

`inFlight` still prevents duplicate work within one visible generation, but it is no longer treated as proof that a response belongs to the current UI. Each request captures a generation. Success, failure, retry-focus scheduling and final busy cleanup all verify the captured generation plus current mounted/open/enabled state before committing.

### Preserve intent without replaying in the background

Collapse copies only `initial`, `refresh` or `continuation` and the optional opaque cursor, advances the generation and clears the active flag immediately. Nothing runs while hidden. A later explicit reopen consumes that descriptor and starts a new GET; a continuation therefore uses the same cursor URL but a new generation.

### Prove both stale-success and stale-failure races

The browser route first holds an empty initial response, collapses and reopens, then accepts ten real rows before releasing the old empty response. It next holds a 503 continuation, collapses and reopens, accepts the real two-row suffix and releases the old failure. The final assertions retain twelve rows, no failure/retry/raw message and focus on the visible collapse control.

### Correct the Taro text-scale contract

Visual inspection of the first normal 390 px lifecycle screenshot exposed oversized history type from iteration 086's `rem` conversion. Taro already uses root `rem` sizing as part of H5 viewport conversion, so ordinary rendering changed even without the test override. Four component variables restore the original 8/9/10/11 px defaults; the accessibility matrix applies exact 16/18/20/22 px values only inside the test. This is synthetic component-reflow evidence, not a browser/system text-scaling claim.

## 4. Validation evidence

- Targeted model validation passed 1 file / 4 tests; the new lifecycle browser race passed 1/1, and the corrected large-text plus lifecycle scenarios passed together 2/2.
- Repository-wide unit validation passed 80 files / 408 tests; strict workspace TypeScript, repository formatting and zero-diff checks passed.
- The complete main browser suite passed 93/93 in 3.0 minutes; the correctly sequenced OIDC build/suite passed 3/3, retaining 96 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. API/administrator, PostgreSQL integration and AI suites were not rerun because the round is client-only; their iteration-085 evidence remains unchanged at 63 integration tests.
- `pnpm client:verify` passed: H5 total 2,802,297 bytes, entry 319,238 and largest async JavaScript 205,178; WeApp total 1,066,047, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only the H5 total ceiling was narrowly rebased from 2,801,000 to 2,805,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status plus the corrected iteration-086 and new iteration-087 knowledge archives are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-086-consent-history-large-text-mobile.png` and `iteration-087-consent-history-interruption-mobile.png`.

## 5. Problems found and experience captured

- A boolean `inFlight` flag answers whether work exists, not whether that work may still alter the visible evidence. A monotonic generation makes the authority decision deterministic at every asynchronous commit point.
- Invalidating only success is insufficient. Failure state, focus scheduling and `finally` cleanup can each corrupt a newer generation independently and need the same guard.
- Reopening should preserve the smallest user intent, not response state or a promise. Operation plus cursor is enough to reproduce one explicit read without creating a background queue.
- A race test is strongest when a newer request wins first and the older opposite result settles afterward. The empty-success and 503-failure pair proves both destructive directions.
- A standard-density screenshot belongs beside a large-text screenshot. It caught the Taro root-`rem` collision that functional overflow assertions did not expose.
- Build-budget failure was real and bounded: lifecycle authority added 1,784 H5 bytes over the previous measured total. Rebaselining only the total ceiling by 4,000 bytes preserves every more specific limit.

## 6. Global state review, remaining risks and next step

Consent-receipt history now has bounded API pagination, explicit read/failure authority, keyboard/reflow evidence and lifecycle-safe asynchronous commits. Physical GET cancellation is still unavailable in the adapter, but obsolete promises cannot commit and no request is persisted or started while hidden. Real browser/system text scaling, screen readers and physical WeChat-device behavior remain release evidence.

Iteration 088 should apply the same current-lifecycle principle to portable export. A late validated artifact must not download, persist or publish success after privacy-page unmount or accepted-overview authority loss; any H5 Blob URL must be revoked, and only a later explicit action may start fresh. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-087 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 086 archive](086-consent-history-accessibility-matrix.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0079](../architecture/decisions/0079-bounded-consent-receipt-history.md)
- [ADR-0080](../architecture/decisions/0080-consent-history-read-authority.md)
- [ADR-0081](../architecture/decisions/0081-consent-history-accessibility-matrix.md)
- [ADR-0082](../architecture/decisions/0082-consent-history-request-lifecycle.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
