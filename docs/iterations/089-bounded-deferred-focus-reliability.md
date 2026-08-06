# Iteration 089: Bounded deferred-focus reliability

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round replaces one-shot deferred H5 focus with a bounded, lifecycle-aware acquisition contract. Acceptance requires a lazy Taro target missed by the first timer to recover; a target replaced after initially accepting focus to recover once more; missing targets to stop after a small deterministic budget; user-selected controls, caller invalidation and unmount to end the attempt; and existing primary/fallback, dialog and history authority semantics to remain unchanged.

The round changes the shared accessibility helper, aggregate-history and destructive-dialog focus lifecycles, focused unit/browser evidence and the smallest required H5 total budget. It adds no API, health interpretation, persistent focus state, global event listener, background polling, cloud service or external provider.

## 2. Structure, technology and design state

- `accessibility.ts` owns one dependency-free H5 scheduler with four attempts, an 80 ms default interval, cancellation, caller authority and a stable-focus confirmation.
- `use-dialog-focus-boundary.ts` carries one focus generation and active cancellation handle across enter, restore, completion, reset and unmount.
- `use-aggregate-history.ts` binds focus generation to the existing read token, cancels superseded initial/retry/return requests and waits for `busy=false` before retry focus belongs to the committed failure phase.
- `accessibility.test.ts` covers late mount, renderer replacement, exhaustion, user focus movement, authority invalidation and fallback order with fake timers and an injectable document boundary.
- `records.spec.ts` makes the first `health-history-close` lookup return no target, then proves bounded recovery, immutable revision loading, Escape return and retained-history retry behavior through the real H5/API surface.

## 3. Implementation method

### Bound acquisition instead of polling

Each request captures the current active element and receives at most four attempts. Missing or temporarily unfocusable targets retry at a fixed 80 ms interval. Cancellation clears the active timer; a false authority predicate prevents any further DOM lookup or focus side effect. WeApp still returns immediately without touching a DOM boundary.

### Distinguish renderer replacement from user movement

The first implementation stopped as soon as `document.activeElement` matched the target. Repeated real-browser runs proved that Taro can then replace that custom element and drop focus to `BODY`. The final scheduler remembers the element it focused and verifies it once. A stable identical node ends the request; body/root fallback permits a replacement lookup; focus on any other control ends the request so user intent wins.

### Make focus follow existing authority

The destructive-dialog hook advances an in-memory generation for every focus transition and on reset/unmount. The history hook combines the same generation with its existing request token, so close, parent refresh, new target and unmount invalidate older timers. Failure focus begins only after the busy phase ends, preventing its attempt budget from running against a UI branch where the retry control cannot yet exist.

### Preserve fallback semantics

Every attempt queries the primary ID first and the fallback only when primary is absent. Escape/explicit/scrim dismissal still returns to the exact trigger when present; successful deletion still chooses the stable ledger refresh; programmatic history close still restores nothing.

## 4. Validation evidence

- The new delayed-mount and bounded-attempt tests failed under the former one-shot helper, then the focused accessibility suite passed 21/21 after implementation and renderer-replacement coverage.
- The injected first-lookup miss passed 1/1. The retained health-history failure case initially reproduced the old miss in 2/10 runs and, after an incomplete busy-phase change, in 5/10. Temporary focus tracing proved `focus()` succeeded before Taro replaced the node and focus fell to `BODY`. After stable-focus confirmation, the same case passed 10/10; diagnostic instrumentation was removed.
- The first broad main run reached 92/94: one focus miss above and one unrelated PostgreSQL cleanup deadlock. After the final fix, the complete main browser suite passed 94/94 in 3.1 minutes. Correctly sequenced OIDC build/browser validation passed 3/3, retaining 97 browser tests.
- Repository-wide unit validation passed 80 files / 415 tests. One parallel unit/build attempt made an existing client-release CLI case exceed its five-second limit; the required serial unit run passed 415/415 without changing timeout or product code.
- Strict workspace TypeScript, repository formatting, zero-diff checks, OIDC H5, WeApp and client quality validation passed. H5 measures 2,813,023 total, 319,238 entry and 205,488 largest async JavaScript bytes. WeApp measures 1,069,025 total, 19,338 vendor and 55,697 largest page bytes. Forbidden runtime-marker scans are empty. Only the H5 total ceiling was narrowly rebased from 2,805,000 to 2,815,000 bytes.
- API/administrator, PostgreSQL integration and AI suites were not rerun because the product change is client-only; their iteration-085 evidence remains unchanged at 63 integration tests.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-089-bounded-focus-mobile.png`.

## 5. Problems found and experience captured

- Finding a target and calling `focus()` is not proof that focus survives the framework's final DOM commit. A bounded stability check is required when a custom-element renderer can replace the node.
- A focus retry should begin when its UI phase is authoritative. Starting the budget while `busy` still renders the continuing branch wastes attempts against a target that cannot exist.
- `activeElement` changes alone cannot distinguish every cause. A different interactive control is a strong user-intent boundary; `BODY` after a previously focused custom element is also observable renderer-replacement evidence and may be recovered only inside the finite window.
- Lifecycle cancellation belongs in the shared hook that knows enter/close/reset/unmount generations, not in every page call site.
- Stress repetition is valuable only after a reproducible failure exists. The before/after 2/10, 5/10 and 10/10 sequence exposed an incomplete hypothesis and then verified the actual fix.
- Validation commands that share CPU should not be parallelized when an existing end-to-end CLI test has a deliberate five-second limit. Serial green evidence is more reproducible than increasing the timeout.
- OIDC browser tests require the OIDC-configured H5 build. Running them against the ordinary development-identity artifact correctly fails because no login boundary is present; the correctly sequenced build and suite passed without code changes.

## 6. Global state review, remaining risks and next step

All shared aggregate-history and destructive-dialog focus paths now use finite acquisition plus generation cancellation. H5 recovery is proven for a missed first lookup and a renderer-replaced target; primary/fallback and read/mutation authorities remain unchanged. These are automated Chromium semantics, not VoiceOver, TalkBack, physical keyboard or WeChat-device evidence.

Iteration 090 should take the locally reproducible part of managed beta hardening: make identity/client verification sequencing explicit and fail closed when the wrong H5 identity artifact is under test, while rechecking deployment-admission evidence without provisioning cloud resources. Account, budget, domain/TLS, real WeChat/OIDC, production object storage/KMS, data-custody owners, centralized telemetry, policy/filing decisions and paid-provider canaries remain mandatory but parked until the user supplies them.

This archive is also the iteration-089 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 088 archive](088-portable-export-lifecycle-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0050](../architecture/decisions/0050-taro-keyboard-focus-contract.md)
- [ADR-0071](../architecture/decisions/0071-aggregate-history-dialog-focus-boundary.md)
- [ADR-0072](../architecture/decisions/0072-destructive-record-dialog-focus-boundary.md)
- [ADR-0084](../architecture/decisions/0084-bounded-deferred-h5-focus.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
