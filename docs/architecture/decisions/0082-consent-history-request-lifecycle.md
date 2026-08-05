# ADR-0082: Consent-history requests require current lifecycle authority

Date: 2026-08-05

Status: accepted

## Context

The consent-receipt history component already separated unread, accepted and stale evidence, but its single `inFlight` flag described concurrency rather than authority. A request could finish after the optional panel was collapsed, the component unmounted or the parent privacy overview disabled its actions. A late first-page success could then replace newer rows with an empty page; a late failure could create hidden retry state and schedule focus outside the visible surface.

The correction must preserve explicit user initiation, exact continuation cursors, current-consent independence and page-memory-only history. It must not add polling, persistence, background synchronization or a misleading claim that Taro's request transport was cancelled.

## Decision

- Assign every history request a monotonically increasing generation and record its operation plus optional cursor as the minimum active intent.
- Permit success, failure, focus scheduling and final busy cleanup only while the request generation is current and the component remains mounted, open and enabled by its parent.
- On collapse, snapshot only the interrupted operation/cursor, advance the generation, clear active/busy/failure state and hide the panel immediately.
- On explicit reopen, consume that snapshot once and start a new request for the same operation and cursor. If no request was interrupted, use the established initial-load behavior.
- On unmount or parent disablement, advance the generation and discard active/interrupted authority. No hidden or later automatic retry is retained.
- Allow obsolete transport promises to finish physically, but ignore their results. Do not persist request intent, poll, replay a mutation or surface raw transport copy.

## Consequences

A newly accepted ten-item first page cannot be overwritten by an older empty result. A reopened continuation sends the exact prior cursor, and an older 503 cannot publish a failure receipt, retry control, backend copy or focus movement after the new twelve-item ledger wins. Collapse/reopen may briefly leave two physical GET promises in progress because the existing adapter exposes no cancellation signal; only the newest explicit generation can commit.

One model test covers every commit predicate. One real API browser scenario covers late initial success and late continuation failure across collapse/reopen. Main browser validation grows to 93/93 and OIDC remains 3/3, for 96 browser tests; unit validation grows to 408 tests. H5/WeApp measure 2,802,297/1,066,047 bytes. The lifecycle code requires a narrow H5 total-budget rebaseline from 2,801,000 to 2,805,000 bytes; entry, async, WeApp, vendor and page gates remain unchanged.

## References

- [ADR-0079](0079-bounded-consent-receipt-history.md)
- [ADR-0080](0080-consent-history-read-authority.md)
- [ADR-0081](0081-consent-history-accessibility-matrix.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Iteration 087 archive](../../iterations/087-consent-history-request-lifecycle.md)
