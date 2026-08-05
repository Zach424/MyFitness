# ADR-0062: Nutrition mutations require one meal-desk authority

Date: 2026-08-05

Status: accepted

## Context

The nutrition page used to load its current meal page and favorites together, then refresh the food catalog independently when the route became visible. A failed first meal read could render the successful-empty meal ledger, while default empty favorite/recent arrays rendered zero-count tabs and a failed catalog read could render “no matching food”. Save, repeat, correction, history, deletion, food reuse and favorite mutation could then act against a mixed-age set of sources.

Meal drafts intentionally remain editable and locally recoverable. The food-photo proof workbench, owner-food register and nutrition observation route have their own read boundaries. Their availability does not authorize the meal editor to combine an unverified meal page, favorite list and food directory.

## Decision

- Model `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` independently of meal, favorite or food count.
- Read the first meal page/cursor, favorites and food catalog concurrently, but accept all three only after every request succeeds. A partial response changes none of the last accepted snapshot.
- Only an accepted empty meal page may render the empty meal ledger. Favorite/recent counts and food empty/search results remain unknown before the composed snapshot is accepted.
- A failed refresh retains the complete last accepted meal/favorite/catalog snapshot in current page memory and labels each retained count.
- Require `ready` authority for meal create/update save, repeat, correction, history open/continuation, list continuation, deletion, food selection/custom-definition correction and favorite add/remove. Keep handler guards as well as disabled semantics.
- Preserve editable draft fields, selected food snapshots and exact correction base revision while authority is uncertain. Starting a foreground read closes old history and deletion contexts.
- Keep the photo proof workbench, general owner-food register and independently read nutrition observation route available because they do not consume or mutate the composed page snapshot. A confirmed photo return remains an unsaved draft and still cannot be saved until authority returns.
- Classify offline transport, HTTP 4xx refusal, HTTP 5xx outage and unknown failure into product-owned copy without exposing backend messages.
- Provide one focusable foreground retry with a concurrent-call guard and explicit pointer/Enter/Space semantics. Do not add polling, persistent meal/catalog cache, background synchronization or mutation replay.

## Consequences

“No meals”, zero favorite/recent counts and “no matching foods” now require an accepted service response rather than default arrays. A retained meal desk remains useful evidence, but cannot authorize a nutrition write or catalog-dependent action until all three sources revalidate. User input stays recoverable and AI photo candidates remain outside the fact boundary.

The state model and presentation add 8,547 bytes to H5 and 10,227 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,651,000 H5 and 942,000 WeApp; entry, async, vendor and page ceilings remain fixed.
