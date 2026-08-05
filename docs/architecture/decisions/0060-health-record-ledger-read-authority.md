# ADR-0060: Health-record mutations require a current list authority

Date: 2026-08-05

Status: accepted

## Context

The health-record page opens with an empty array, then requests the first current-record page and its continuation cursor. Before this decision, a failed first request rendered the same “还没有身体记录” and zero-entry trend as a successful empty response, while the create editor stayed operable. The page also had no explicit foreground refresh, so an already rendered list could not be identified as retained evidence or safely revalidated before correction, history access or deletion.

The editor intentionally supports local draft recovery and exact optimistic revisions. Those mechanisms protect input and writes, but they do not prove that the surrounding list is current. Persisting another sensitive health-record cache or replaying mutations is outside this local reliability scope.

## Decision

- Model `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` independently of record count.
- Accept the first current-record page and continuation cursor together only after the list request succeeds. Only an accepted empty page may render the empty-logbook and zero-entry trend states.
- A failed first read renders unknown record/trend states and must not enable record save. A failed refresh retains the last accepted page in current page memory and labels it read-only.
- Require `ready` authority for create/update save, correction start, history open/continuation, list continuation and delete open/confirmation. Keep handler guards as well as disabled semantics for Taro custom controls.
- Preserve draft input and unsaved correction content while authority is uncertain. Back navigation, the separate progress-photo workflow and the independently read long-term metric observation route do not consume the list snapshot and remain available.
- Starting a foreground read closes any old history or deletion context. A correction draft may stay visible, but optimistic revision validation still governs its eventual save after authority returns.
- Classify offline transport, HTTP 4xx refusal, HTTP 5xx service outage and unknown failure into product-owned copy without exposing backend messages.
- Provide one foreground refresh/retry with a concurrent-call guard and explicit pointer/Enter/Space semantics. A failed read moves H5 focus to retry.
- Do not add polling, a persistent record-list cache, optimistic server facts, background synchronization or mutation replay.

## Consequences

“No records” and zero recent entries now mean the service accepted an empty page. A retained log stays useful for reading but cannot authorize a health-data write or history/destruction action until revalidation succeeds. Local user input remains recoverable without being confused with server authority.

The state model and presentation add 7,772 bytes to H5 and 8,664 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,634,000 H5 and 922,000 WeApp; entry, async, vendor and page ceilings remain fixed.
