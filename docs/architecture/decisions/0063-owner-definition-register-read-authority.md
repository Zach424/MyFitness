# ADR-0063: Owner-definition registers require accepted read authority

Date: 2026-08-05

Status: accepted

## Context

The dedicated owner-food and owner-action registers initialized their visible definitions as empty arrays. If the first catalog request failed, each route could therefore show an empty register and leave definition creation available without proving the current owner directory. Later correction, history and archive work depended on whatever list happened to be visible, but the page exposed no explicit foreground revalidation or retained-snapshot state.

Meal and workout pages already compose their own recording-surface reads. Those authorities do not establish that a separately navigated mutable-definition register has accepted its current owner list. The register must own that boundary without introducing another durable copy of health-related definitions.

## Decision

- Share one dependency-free register read model across food and action definitions with `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` phases.
- Treat only a successful catalog response as an accepted register snapshot. Before that response, definition count and list content are unknown rather than zero or empty.
- Retain a failed-refresh snapshot only in current page memory and label the exact accepted definition count. Do not replace it with a partial or failed response.
- Require `ready` authority for create, correction, revision-history continuation, archive request/confirmation and save handlers. Preserve the visible accepted list during refresh or failure, but disable its write affordances.
- Keep back navigation and an explicit foreground retry available. Map offline transport, HTTP 4xx refusal, HTTP 5xx outage and unexpected failures to product-owned copy without exposing backend messages.
- Delay the initial success/failure focus destination until the H5 route transition settles: successful reads focus the back action, while initial failures focus retry. Later failed refreshes focus retry promptly.
- Do not add polling, persistent catalog cache, offline database, background synchronization or mutation replay. Do not change the API, schema or definition snapshot semantics.

## Consequences

An empty owner register is now a server-confirmed fact. Initial failure shows an unknown count and cannot authorize a definition write; later failure retains useful definitions as visibly stale evidence while every dependent mutation remains frozen until one retry succeeds. Food and action registers have equivalent recovery semantics without coupling their records or persisting a second sensitive catalog copy.

The shared model and page states add 8,687 bytes to H5 and 9,813 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,659,000 H5 and 952,000 WeApp; entry, async, vendor and page ceilings remain fixed.
