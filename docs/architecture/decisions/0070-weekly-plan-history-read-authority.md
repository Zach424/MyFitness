# ADR-0070: Weekly-plan history read authority

Date: 2026-08-05

Status: accepted

## Context

Week Fold already read the current plan, its first ten immutable plan revisions and AI explanation history as one initial page snapshot. Its older plan-history continuation still used generic feedback: a failed suffix request kept the rows but left the cursor apparently reusable and exposed raw service detail. A successful empty AI explanation history was also rendered as an omitted ledger, which did not distinguish confirmed absence from unread evidence.

Plan decisions and explanation runs are related evidence but have different write paths. Retrying an audit read must not regenerate a plan, replay a plan decision or invoke the explanation provider.

## Decision

- Apply the shared aggregate-history failure taxonomy and presentation to weekly-plan continuation while retaining the existing revision-bound server cursor.
- A failed suffix GET preserves the accepted newest-first decision prefix in page memory, labels its exact count, freezes the old continuation and exposes one stable focused retry.
- Retry reissues only `GET /plans/{id}/history` with the same cursor. It cannot call plan generation, decision mutation or AI explanation endpoints.
- Accepting a newer composed plan snapshot advances the history generation. Late suffix success, failure and completion branches from the prior generation cannot mutate the new history state.
- Keep the accepted current plan and already-read explanation provenance visible because their authority was established independently from the failed suffix.
- Render a successful empty explanation array as an explicit accepted-snapshot receipt. Do not invent explanation counts while the composed initial plan read is unknown.
- Do not poll, persist plan-history cache, advance the cursor on failure or expose raw transport copy.

## Consequences

An older-page outage no longer makes a retained plan history look current or empty, and recovery cannot spend provider budget or change the weekly plan. The explanation rail now distinguishes a confirmed empty ledger from absence of UI while preserving its secondary provenance role.

No API, contract, database, plan engine, AI validator or safety rule changes. H5 total grows from 2,743,361 to 2,750,750 bytes, so only its total ceiling moves narrowly to 2,752,000 bytes. H5 entry/largest async remain 319,235/207,097; WeApp measures 1,002,510 total, 18,915 vendor and 56,044 largest page. The page ceiling moves narrowly from 56,000 to 56,100 bytes; all other WeApp limits remain unchanged.

The next local boundary is deterministic focus entry, Escape close and trigger return for the three aggregate-history dialogs.

## References

- [ADR-0047](0047-stable-weekly-plan-history-pagination.md)
- [ADR-0068](0068-aggregate-revision-sheet-read-authority.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
