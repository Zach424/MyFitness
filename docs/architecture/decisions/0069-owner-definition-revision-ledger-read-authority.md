# ADR-0069: Owner-definition revision-ledger read authority

Date: 2026-08-05

Status: accepted

## Context

Exercise and food owner-definition histories already shared a bounded progressive ledger, but each editor owned ad hoc loading state. A failed first GET replaced unknown history with an empty array and raw page feedback, making unavailable audit evidence resemble a successful no-version result. A failed older-page request retained rows and an apparently reusable cursor without labeling the accepted prefix.

Unlike a failed owner-register read, a history-only failure does not invalidate the current definition snapshot that opened the editor. Freezing correction or archive would couple two independent read authorities and discard useful unsaved owner input.

## Decision

- Reuse the typed page-memory aggregate-history reader for both exercise and food definitions. The structural history page is the same `{ items, nextCursor }` contract even though the server response names its owner key `entryId`.
- Let `DefinitionRevisionLedger` render initial-loading, ready, continuing, initial-error, retained-stale and successful-empty states through the shared audit receipt.
- Initial history failure keeps the editor, exact selected definition and local correction values mounted. It cannot publish an empty revision ledger or raw transport text.
- Continuation failure preserves the accepted newest-first revision prefix, labels its count, freezes the old cursor and exposes one stable focused retry that reissues only that suffix GET.
- History busy/failure state does not disable correction, archive or the parent register. Those operations continue to require their existing accepted register snapshot, optimistic revision and workbench reconciliation rules.
- Closing the editor, switching definition or unmounting invalidates late history responses. Do not poll, persist history/cache commands or replay a definition mutation.

## Consequences

The same revision ledger now means the same evidence state for actions and foods: unknown is not empty, a retained prefix is bounded, and retry cannot silently advance a stale cursor. Users may continue editing their locally held correction while audit history is unavailable because the source definition remains separately authorized.

No API, contract, database, definition snapshot or privacy lifecycle changes. Reusing the shared presentation in two lazy definition routes raises H5 total output from 2,736,743 to 2,743,361 bytes; WeApp total falls from 1,003,905 to 1,001,863 after removing duplicate page logic. Entry/largest async JavaScript, vendor and largest WeApp page remain 319,235/207,097/18,915/55,523 bytes. Only the H5 total ceiling moves to 2,745,000 bytes.

The Week Fold plan-revision continuation and AI-explanation history composition remain the next local audit-read boundary.

## References

- [ADR-0046](0046-stable-definition-history-pagination.md)
- [ADR-0063](0063-owner-definition-register-read-authority.md)
- [ADR-0068](0068-aggregate-revision-sheet-read-authority.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
