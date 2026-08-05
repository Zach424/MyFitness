# ADR-0057: Today read failures preserve snapshot authority

Date: 2026-08-05

Status: accepted

## Context

Today combines the read-only dashboard and weekly-plan list into the product entry surface. Before this decision, a failed first read fell through the same defaults as a successful empty dashboard, rendering zero records and zero trends. A later failed refresh happened to leave React state in place but exposed only a dismissible raw error, so users could not tell that the visible evidence was from the preceding successful read or retry it directly. Persistent offline storage would introduce sensitive-data retention and multi-user custody questions beyond this local reliability gap.

## Decision

- Model five presentation phases independently of domain data: `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale`.
- Only a successful atomic dashboard/weekly-plan read may render empty-state copy, zero counts or a new snapshot. A failed first read renders em dashes and explicitly says the record count is unknown.
- Classify transport failure, HTTP 4xx refusal, HTTP 5xx service outage and unknown failure into product-owned copy. Do not render raw backend messages.
- Retain the last successful dashboard and plan pair only in current page memory. A failed refresh leaves its evidence/revisions unchanged, labels the snapshot as retained and does not partially adopt either response.
- Provide one foreground refresh/retry action, guard concurrent calls and perform no polling, background replay or persistent sensitive-data cache.
- Give the initial-error retry delayed H5 focus and reuse explicit pointer/Enter/Space and `aria-disabled` semantics across H5 and WeApp output.

## Consequences

Today can distinguish absence of evidence from absence of a trustworthy response, and a transient refresh failure no longer destroys or silently reclassifies already-visible facts. The retained snapshot has no persisted timestamp and disappears with the page/process; production offline access, encrypted storage and cross-device consistency remain separate custody decisions.

The state model and styles add 5,638 bytes to H5 and 6,998 bytes to WeApp. H5 entry moves only from 319,232 to 319,236 bytes and largest async JavaScript remains 199,198; WeApp vendor/largest page remain 18,915/49,800. Budgets move narrowly to 2,613,000 H5 total and 899,000 WeApp total while entry/async/vendor/page ceilings remain fixed.
