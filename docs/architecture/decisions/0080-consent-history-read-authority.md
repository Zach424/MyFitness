# ADR-0080: Consent history keeps independent read authority

Date: 2026-08-05

Status: accepted

## Context

The bounded consent-receipt endpoint distinguishes server-confirmed empty history from an unread result and issues a stable opaque cursor for older receipts. The first client slice retained items on request failure, but its operation phases and failure copy lived inside one component, and a non-empty ledger had no explicit way to recheck its newest page.

Treating a failed first read as empty would hide custody evidence. Dropping or advancing an accepted cursor after a continuation failure could skip receipts. Conversely, borrowing the history request's state to disable current consent revocation would incorrectly turn optional chronology into authorization authority.

## Decision

- Model collapsed, initial-loading, ready, refreshing, continuing, initial-error and retained-stale history phases separately from receipt count.
- Publish empty history only after a successful first-page response. A failed first read retains `null` authority and shows one explicit retry.
- Add an explicit latest-page refresh for accepted non-empty history. A failed refresh keeps the accepted page and its continuation position until retry succeeds.
- On continuation failure, retain the accepted newest-first prefix and exact cursor. Retry repeats only that GET with the byte-identical cursor; it does not refresh the head, poll or advance the boundary.
- Classify offline transport, 4xx refusal, 5xx service outage and unknown adapter failure into product-owned copy. Never render raw backend or transport messages.
- Move H5 focus to one stable retry after failure and guard all history actions with explicit pointer/Enter/Space activation semantics.
- Keep current overview and revocation authority independent. History failure neither enables nor freezes a current consent mutation.
- Retain history items/cursors only in React page memory. Add no persistent cache, background synchronization or mutation replay.

## Consequences

Unknown, accepted and stale history are now reproducibly distinct. Real API Chromium proof injects service failure on first read, refusal on latest-page refresh and service failure on continuation, then confirms ten retained items, independently enabled revocation controls and a same-URL retry that restores all twelve receipts.

The client adds one dependency-free state/presentation model and one manual latest-page action. Repository validation passes 80 files / 407 unit tests, 19 / 63 PostgreSQL integration tests, 91 main plus 3 OIDC browser tests and all production builds. H5/WeApp measure 2,800,306/1,064,135 bytes; only the WeApp total ceiling moves narrowly from 1,064,000 to 1,067,000 bytes.

## References

- [ADR-0059](0059-privacy-custody-read-authority.md)
- [ADR-0077](0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0079](0079-bounded-consent-receipt-history.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
