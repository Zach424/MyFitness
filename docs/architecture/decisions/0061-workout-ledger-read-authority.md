# ADR-0061: Workout mutations require a composed ledger authority

Date: 2026-08-05

Status: accepted

## Context

The workout page used to read the current workout page and exercise catalog independently. A failed first workout request could render the same empty training log as a successful empty response, while a failed catalog request could render “no matching actions”. Save, repeat, correction, history and deletion could remain available against whichever half happened to load. This made two partial responses look like one current recording surface.

Workout drafts intentionally remain editable and locally recoverable. The dedicated owner-action register and exercise observation route also have their own read boundaries. Neither fact authorizes the workout editor to combine an unverified workout page with an unverified action directory.

## Decision

- Model `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` independently of workout or action count.
- Read the first workout page/cursor and exercise catalog concurrently, but accept them only together after both requests succeed. A partial response changes neither half of the last accepted snapshot.
- Only an accepted empty workout page may render the empty training log, and only an accepted empty catalog may render the no-match state. Before first acceptance, both counts and emptiness remain unknown.
- A failed refresh retains the complete last accepted workout/catalog snapshot in current page memory and labels it read-only.
- Require `ready` authority for workout create/update save, quick repeat, card repeat, correction, history open/continuation, list continuation, deletion, catalog selection and custom-action correction. Keep handler guards as well as disabled semantics.
- Preserve editable draft fields and exact correction base revision while authority is uncertain. Starting a foreground read closes old history and deletion contexts.
- Keep the general owner-action register and independently read exercise observations available because they do not consume or mutate the composed page snapshot.
- Classify offline transport, HTTP 4xx refusal, HTTP 5xx outage and unknown failure into product-owned copy without exposing backend messages.
- Provide one focusable foreground retry with a concurrent-call guard and explicit pointer/Enter/Space semantics. Do not add polling, persistent workout/catalog cache, background synchronization or mutation replay.

## Consequences

“No workouts” and “no matching actions” now mean that both service reads completed and their snapshot was accepted. A retained training log and action directory remain useful evidence, but cannot authorize a workout or action-dependent operation until both are revalidated. User input stays recoverable without being confused with server facts.

The state model and presentation add 8,167 bytes to H5 and 9,720 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,642,000 H5 and 932,000 WeApp; entry, async, vendor and page ceilings remain fixed.
