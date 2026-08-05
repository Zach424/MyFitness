# Iteration 076: Aggregate-history dialog focus boundary

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the body/recovery, workout and meal aggregate-history dialogs as one H5 keyboard focus boundary. Acceptance requires guarded pointer/Enter/Space opening, deterministic safe-close focus after a successful open, retry focus precedence for unknown/stale reads, one Escape/explicit/scrim dismissal path, and return to the exact invoking history control or a stable ledger fallback.

The round adds no API/schema/database change, revision interpretation, mutation authority, persistent focus/history cache, global keyboard listener, polling or claim about real screen readers/WeChat devices. Managed infrastructure, identity tenants, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `useAggregateHistory` accepts an optional initial/fallback focus boundary, keeps one trigger ID in a ref, distinguishes user `dismiss` from programmatic `close` and retains its existing request-generation invalidation.
- `accessibility.ts` adds a dependency-free Escape adapter that ignores repeated/non-Escape keys, prevents default behavior, stops propagation when available and calls one dismissal action.
- Health, workout and meal history triggers now use stable aggregate-specific IDs and `buttonActivationProps`; close and scrim controls share `dismiss`.
- Page styles explicitly outline Taro custom close/history elements instead of relying on native button selectors.
- Mobile and wide artifacts show the same safe circular close focus while retaining the established bottom-sheet/side-rail compositions.

## 3. Implementation method

### Separate user dismissal from programmatic reset

The existing `close` remains the parent-ledger reset: it invalidates pending history reads, clears state and discards the trigger ID without moving focus. `dismiss` captures the exact trigger or fallback, calls that reset and schedules H5-only return after React removes the modal surface. This prevents a background/foreground parent refresh from focusing a row while replacing its authority.

### Preserve retry precedence

Open schedules safe-close focus after 40 ms. A failed history read retains the established 80 ms retry focus, so the actionable recovery receipt wins even for a fast offline response. Successful reads leave the safe close action focused. Both delays are H5-only and remain no-ops in WeApp.

### Unify keyboard and pointer behavior

Each history trigger, circular close and scrim uses the same guarded Taro activation contract. Escape bubbles to the dialog wrapper and calls the same `dismiss`; Enter/Space remain owned by their focused control. No global listener or route state is introduced.

### Keep focus visible without changing the sheet identity

Taro's custom H5 button element does not match native `button:focus-visible`, so the three page styles explicitly target their close and row-action classes. The mineral outline and offset preserve the existing record/workout/nutrition palette while remaining visible without color alone through the double-ring geometry.

## 4. Validation evidence

- Repository-wide unit validation passed 72 files / 367 tests, including three Escape-adapter and two primary/fallback focus cases; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- Four targeted real-service browser checks passed across health success/stale, workout initial offline and meal lifecycle. The complete main H5 browser suite passed 82/82 in 2.6 minutes; OIDC passed 3/3, retaining 85 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,760,636 bytes, entry 319,235 and largest async JavaScript 207,634; WeApp total 1,003,732, vendor 18,915 and largest page 56,044. Forbidden runtime-marker scans are empty; the async route retains only 366 bytes of headroom and is the next measured client debt.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-076-history-focus-mobile.png` and `iteration-076-history-focus-wide.png`.

## 5. Problems found and experience captured

- `aria-modal` does not move focus. A dialog can be semantically named while keyboard focus remains behind it.
- Taro H5 custom button elements need explicit activation and class-based focus styling; native button behavior/selector assumptions are not sufficient.
- Initial focus and failure focus need intentional ordering. The later retry action should win because it is the only current recovery path.
- Programmatic close and user dismissal are different operations. Restoring focus during a parent refresh can target evidence whose authority is being replaced.
- An exact DOM ID is sufficient ephemeral focus context; it should not be persisted, placed in URLs or coupled to revision data.
- Selecting a fallback ID is not enough; the delayed focus helper must actually try it after the primary lookup fails.
- Test all dismissal paths against the same focus-return assertion. Shared implementation alone does not prove scrim, Escape and explicit controls are wired consistently.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the two new iteration artifacts remain.

## 6. Global state review, remaining risks and next step

All three aggregate-history dialogs now have reproducible H5 keyboard entry, retry precedence and dismissal return behavior. This is automated browser evidence, not a claim of focus trapping or real assistive-technology/device support.

The next local gap is the destructive confirmation dialogs for body/recovery records, workouts and meals. They expose modal semantics but do not yet focus safe cancel, provide guarded keyboard delete triggers or define cancel/post-success return when the original row remains or disappears. Iteration 077 should harden that boundary without weakening optimistic revision, parent read authority or immutable audit retention. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-076 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 075 archive](075-weekly-plan-history-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0050](../architecture/decisions/0050-taro-keyboard-focus-contract.md)
- [ADR-0068](../architecture/decisions/0068-aggregate-revision-sheet-read-authority.md)
- [ADR-0071](../architecture/decisions/0071-aggregate-history-dialog-focus-boundary.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
