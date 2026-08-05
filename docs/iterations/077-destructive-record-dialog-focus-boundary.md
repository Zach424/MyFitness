# Iteration 077: Destructive record-dialog focus boundary

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the body/recovery, workout and meal destructive confirmation dialogs as one H5 safe-cancel focus boundary. Acceptance requires guarded pointer/Enter/Space opening, deterministic cancel-first focus, Escape and explicit cancellation returning to the exact trigger, an in-flight dismissal freeze, failure refocus on cancel and stable post-success focus after the deleted trigger disappears.

The round adds no API/schema/database change, deletion replay, persistent workflow/focus state, global keyboard listener, revision relaxation or change to ledger read authority and immutable audit retention. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `use-dialog-focus-boundary.ts` is a small React ref-based boundary with `enter`, `restore`, `complete` and `reset` transitions. It stores only one trigger ID and delegates H5-only delayed focus to the existing accessibility helpers.
- `escapeDismissProps` accepts a disabled state so an in-flight destructive operation cannot appear cancelled through Escape.
- Health, workout and meal delete triggers now use stable IDs and the guarded Taro pointer/Enter/Space adapter. Each dialog focuses its cancel action first and defines the page's stable ledger-refresh control as fallback.
- Mobile and wide compositions use the existing paper/scrim language, a visible double mineral ring around cancel and a deliberately separate danger color for explicit confirmation.
- Taro's literal `disabled="false"` H5 attribute is neutralized through the product-owned `aria-disabled="false"` style contract, keeping enabled cancel text visibly dark.

## 3. Implementation method

### Keep focus state ephemeral and page-owned

`enter` records the stable trigger ID and schedules focus on cancel after React mounts the dialog. `restore` captures the trigger/fallback, closes through the page action and then focuses the exact row if it still exists. Parent ledger loads call `reset`, so a programmatic refresh cannot return focus into evidence being replaced.

### Freeze dismissal after commitment

Each page sets its existing saving flag before sending the expected-revision DELETE. Both cancel and confirm receive explicit disabled semantics, and the dialog's Escape adapter receives the same gate. This keeps the visible state aligned with the irreversible request while adding no cancellation protocol the API cannot honor.

### Choose different failure and success destinations

A rejected or interrupted request leaves the dialog present and schedules focus back to cancel. A successful soft deletion removes the aggregate from the accepted page, clears correction state where relevant, closes the dialog and focuses ledger refresh instead of looking for the vanished row trigger. The server's audit history remains untouched.

### Verify the custom-element visual contract

Targeted browser assertions initially failed because all three enabled cancel controls computed to translucent white. Taro's custom element emitted `disabled="false"`, which still matched its attribute-based disabled selector after the page class rule. Adding the more specific product-owned `aria-disabled="false"` selector restored the intended ink color; tests now assert the computed value and inspected screenshots confirm the hierarchy.

## 4. Validation evidence

- Repository-wide unit validation passed 72 files / 368 tests, including disabled Escape behavior; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- Three targeted real-service browser lifecycle checks passed across health, workout and meal deletion. The complete main H5 browser suite passed 82/82 in 2.7 minutes; OIDC passed 3/3, retaining 85 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,764,092 bytes, entry 319,235 and largest async JavaScript 207,699; WeApp total 1,005,621, vendor 18,915 and largest page 56,044. Forbidden runtime-marker scans are empty. Only total budgets moved, to 2,765,500/1,007,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-077-delete-cancel-mobile.png` and `iteration-077-delete-cancel-wide.png`.

## 5. Problems found and experience captured

- A destructive dialog's first focus is a product-safety decision. Semantic modal naming alone does not choose the non-destructive path.
- User dismissal and completed deletion need different focus destinations: the exact row is correct only while it still exists.
- Escape should not visually cancel an operation after submission unless the backend supports actual cancellation.
- Taro's H5 custom elements can carry `disabled="false"`; broad `[disabled]` library selectors therefore style an enabled control as disabled. Use and test explicit boolean-value/ARIA contracts.
- Computed-style assertions complement screenshots: they caught a low-contrast cancel label consistently across all three pages before archival.
- Focus recovery must not grant mutation authority. The existing read-ready and expected-revision guards remain the source of deletion permission.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the two new iteration artifacts remain.

## 6. Global state review, remaining risks and next step

All three destructive aggregate dialogs now have reproducible H5 keyboard entry, safe cancellation, honest in-flight behavior and post-success recovery. This is automated browser evidence, not a claim of focus trapping or real assistive-technology/WeChat-device support.

The next local correctness gap is ambiguous aggregate deletion. A DELETE may commit while its browser response is lost, leaving the current UI in an error dialog even though the row is gone. Iteration 078 should reconcile the exact current health/workout/meal aggregate first, distinguish confirmed absence from the same or changed revision, and never blindly replay the destructive request. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-077 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 076 archive](076-aggregate-history-dialog-focus-boundary.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0050](../architecture/decisions/0050-taro-keyboard-focus-contract.md)
- [ADR-0071](../architecture/decisions/0071-aggregate-history-dialog-focus-boundary.md)
- [ADR-0072](../architecture/decisions/0072-destructive-record-dialog-focus-boundary.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
