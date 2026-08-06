# ADR-0084: Bounded, lifecycle-aware deferred H5 focus

Date: 2026-08-05

Status: accepted

## Context

Taro H5 renders interactive controls as custom elements and may mount or replace a target after the React effect that requests focus. The previous shared helper made one delayed `focus()` call. Broad browser runs therefore intermittently left aggregate-history retry and delete-recovery actions inactive even though the final control was visible. An unbounded retry would hide lifecycle bugs and could steal focus after the user moved elsewhere.

## Decision

- Replace the one-shot timer with one H5-only scheduler capped at four attempts, using an 80 ms retry interval by default. The caller may cancel it or supply a live `canFocus` authority predicate.
- Capture the active element when scheduling. A different interactive active element ends the request; the original element, page body/document root and the last target focused by this request remain eligible transition states.
- After `focus()` succeeds, verify the same target once on the next bounded interval. If Taro replaced that node and focus fell back to the page body, find and focus the replacement. If the same node remains active, stop immediately.
- Preserve primary/fallback ordering: use the fallback only when the primary is absent in the current attempt.
- Give destructive-dialog focus a monotonic in-memory generation. Enter, restore, completion and reset cancel the previous request; unmount invalidates the generation.
- Bind aggregate-history focus to both its focus generation and read request token. Initial close focus, failure retry and dismissal restoration supersede one another; close, parent refresh and unmount invalidate pending focus. Failure focus starts only after `busy` is false and the retry state is the committed UI phase.
- Add no DOM polling outside the small attempt budget, global listener, focus persistence, data authority or WeApp focus claim.

## Consequences

Late-mounted controls and Taro-replaced nodes receive deterministic recovery while obsolete requests cannot outlive dialog/history authority. A user-selected different control wins over the scheduler, and page-body fallback is treated only as a renderer transition during the finite window.

Unit coverage proves delayed mount, renderer replacement, four-attempt exhaustion, user movement, caller invalidation and fallback priority. A real H5 test hides the health-history close target from the first lookup and still reaches it. The previously intermittent retained-history retry passed 10/10 repeated runs and the complete main browser suite passed 94/94.

The shared implementation raises H5 total output to 2,813,023 bytes and largest async JavaScript to 205,488 bytes; entry remains 319,238. Only the H5 total ceiling moves from 2,805,000 to 2,815,000 bytes. WeApp remains within its existing ceilings at 1,069,025 total, 19,338 vendor and 55,697 largest page bytes.

## References

- [ADR-0050](0050-taro-keyboard-focus-contract.md)
- [ADR-0071](0071-aggregate-history-dialog-focus-boundary.md)
- [ADR-0072](0072-destructive-record-dialog-focus-boundary.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
