# ADR-0065: Private-photo inventory read authority

Date: 2026-08-05

Status: accepted

## Context

The food-photo proof workbench initialized its selected analysis as absent, and the progress-photo contact sheet initialized its list as empty. A failed first list request therefore fell through to the same intake and empty-comparison language used after a successful empty response. Media reservation, proposal confirmation, comparison selection and deletion could remain available without a current owner-visible private inventory. Both pages already had operation-specific ambiguous-write recovery, but that did not establish read authority before a new operation began.

## Decision

- Treat each purpose-scoped owner list as one five-phase authority: initial loading, ready, refreshing with an accepted snapshot, initial error and stale accepted snapshot.
- Accept empty only from a successful complete list response. Initial failure renders no empty contact sheet, no missing-proof conclusion and no media/custody action.
- Keep the most recent successful list only in page memory. A failed refresh labels that snapshot as retained and freezes reservation/upload entry, food-candidate editing/confirmation/deletion, progress comparison selection and deletion.
- Keep only presentation-local inspection that cannot contact the service or change custody usable; for example, an already selected progress-photo overlay may still change opacity.
- Reuse the existing operation-authority matrix after a write begins. List reconciliation may replace the accepted inventory, but no file, path, request, consent receipt or replay instruction is persisted or automatically replayed.
- Map transport, 4xx refusal, 5xx outage and unknown failures to product-owned copy. Raw backend messages do not enter the authority receipt.
- Provide one guarded foreground refresh while ready and one explicit retry while unknown or stale. There is no polling or background synchronization. Initial H5 focus follows either the back action or retry after route transition; later failure moves focus promptly to retry.

## Consequences

The two sensitive media surfaces can no longer infer “nothing retained” from a read failure or authorize a custody-changing operation from an unverified list. Existing food-photo confirmed-only handoff, progress-photo two-purpose consent, private preview, expiry and durable object-deletion semantics remain unchanged.

The shared presentation and dependency-free state model add measured lazy-route weight. H5 total/largest async JavaScript become 2,691,432/207,097 bytes, and WeApp total becomes 974,386 bytes; entry, vendor and largest WeApp page remain 319,235, 18,915 and 55,523 bytes. Production object storage, real device behavior and physical deletion evidence remain external release gates.

## References

- [ADR-0010](0010-revocable-food-photo-candidates.md)
- [ADR-0029](0029-privacy-first-progress-photo-assistance.md)
- [ADR-0052](0052-authority-aware-sensitive-workbench-recovery.md)
- [Food-photo model](../FOOD_PHOTO_MODEL.md)
- [Progress-photo model](../PROGRESS_PHOTO_MODEL.md)
