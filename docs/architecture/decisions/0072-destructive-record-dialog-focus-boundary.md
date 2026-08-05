# ADR-0072: Destructive record-dialog focus boundary

Date: 2026-08-05

Status: accepted

## Context

The body/recovery, workout and meal ledgers already required explicit confirmation before soft deletion, but their row triggers relied on raw Taro click handling and opening did not choose a safe keyboard destination. Cancel and Escape had no shared focus-return contract, while success removes the initiating row entirely. Taro H5 renders buttons as custom elements, including a literal `disabled="false"` attribute, so native button activation, disabled styling and focus recovery cannot be assumed.

Deletion still belongs to each page because it depends on the accepted parent ledger, the aggregate's expected revision and page-specific editor cleanup. The reusable boundary should own only ephemeral focus behavior and must not become mutation authority or persisted workflow state.

## Decision

- Add a dependency-free `useDialogFocusBoundary` hook that stores only the initiating control ID in a ref. Opening schedules H5 focus on one safe initial control.
- Health-record, workout and meal delete triggers receive stable IDs and the guarded pointer/Enter/Space adapter. The safe initial control is always cancel.
- Explicit cancel and enabled Escape restore the exact trigger, with the stable ledger-refresh action as fallback.
- Once the DELETE is submitted, cancel and Escape are disabled until resolution. The dangerous action also remains unavailable while the request is in flight.
- Successful deletion clears the trigger reference and focuses the stable ledger refresh because the original row has disappeared. Failure keeps the dialog open and returns focus to cancel.
- Extend the Escape adapter with a disabled gate and explicitly style Taro controls through `aria-disabled="false"` so the library's literal false `disabled` attribute cannot make enabled cancel text illegible.
- Keep expected-revision DELETE requests, server soft-delete behavior, immutable revision history and parent read-authority gates unchanged. Add no persistent focus state, background replay or global keyboard listener.

## Consequences

All three record ledgers now expose the same safe default, deterministic cancellation return and honest in-flight state. A successful destructive operation no longer attempts to focus a missing row, while failure preserves a nearby non-destructive recovery action.

One new unit case verifies disabled Escape behavior. Real-service browser lifecycle coverage verifies keyboard opening, cancel-first focus, Escape/explicit return, in-flight dismissal freeze, successful deletion and stable fallback across all three domains. Mobile and wide screenshots were inspected. Visual QA also caught and fixed the enabled-cancel color override caused by Taro's custom `disabled="false"` rendering.

H5 grows from 2,760,636 to 2,764,092 bytes and WeApp from 1,003,732 to 1,005,621 bytes. Only total ceilings move to 2,765,500 and 1,007,000; H5 entry/largest async remain 319,235/207,699, and WeApp vendor/largest page remain 18,915/56,044 under their previous ceilings.

This boundary still does not resolve a lost DELETE response. The next local correctness step is exact-read reconciliation for ambiguous aggregate deletion, without blind replay.

## References

- [ADR-0004](0004-health-record-revision-lifecycle.md)
- [ADR-0005](0005-structured-workout-aggregate.md)
- [ADR-0006](0006-nutrition-snapshot-aggregate.md)
- [ADR-0050](0050-taro-keyboard-focus-contract.md)
- [ADR-0071](0071-aggregate-history-dialog-focus-boundary.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
