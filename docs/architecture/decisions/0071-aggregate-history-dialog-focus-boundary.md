# ADR-0071: Aggregate-history dialog focus boundary

Date: 2026-08-05

Status: accepted

## Context

The body/recovery, workout and meal history sheets already exposed `dialog`/modal semantics and stable retry focus, but their row triggers relied on raw Taro click handling. Successful open left focus behind the modal surface, and explicit or scrim close did not restore the initiating control. H5 renders Taro buttons as custom elements, so native button keyboard and focus styling cannot be assumed.

The shared aggregate-history reader already owns open/close generation invalidation. Focus state should follow that lifecycle without adding URL, storage or history-data state and without making programmatic parent refresh move focus into a changing ledger.

## Decision

- Extend the aggregate-history reader with an optional focus boundary containing a safe initial control ID and a stable parent fallback ID. Store only the current trigger ID in memory.
- Row history triggers use the shared guarded Taro activation adapter for pointer, Enter and Space and pass their stable owner/aggregate-specific ID into `open`.
- After open, delayed H5-only focus moves to the safe close control. If the initial or continuation read fails, the existing later retry focus wins.
- Add one shared Escape-dismiss adapter. Escape, explicit close and scrim activation call `dismiss`, which invalidates requests, closes the sheet and restores the exact trigger or fallback.
- Keep `close` as a programmatic reset used by parent refresh. It clears the stored trigger and never restores focus.
- Add class-based focus rings for Taro close and history-trigger custom elements. Do not rely only on native `button:focus-visible`.
- Do not add focus persistence, global keyboard listeners, data changes, mutation permission, polling or claims about untested screen readers/devices.

## Consequences

The three revision sheets now have deterministic keyboard entry and return behavior while preserving retry authority and late-response invalidation. Dismissal paths cannot drift, and a parent ledger refresh cannot accidentally focus a stale row.

Five new unit cases verify Escape consumption, non-Escape pass-through and true primary/fallback focus selection. Real-service browser evidence covers all three domains, successful mobile/wide entry, initial failure retry precedence and Escape/explicit/scrim return.

H5 grows from 2,750,750 to 2,760,636 bytes; only its total ceiling moves to 2,762,000. Entry/largest async are 319,235/207,634 within existing limits, although the async route now has only 366 bytes of budget headroom. WeApp grows from 1,002,510 to 1,003,732 bytes while vendor/largest page remain 18,915/56,044 within existing limits.

The next local boundary is cancel-first focus and post-success recovery for the three destructive record confirmation dialogs.

## References

- [ADR-0050](0050-taro-keyboard-focus-contract.md)
- [ADR-0068](0068-aggregate-revision-sheet-read-authority.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
