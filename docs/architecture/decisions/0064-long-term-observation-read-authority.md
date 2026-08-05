# ADR-0064: Long-term observations require complete read authority

Date: 2026-08-05

Status: accepted

## Context

The health and exercise observation routes first read a source ledger to derive selectable identities, published those choices, and then requested the selected insight projection in a second effect. A failure in the second request could therefore expose a partially accepted observation. All three observation routes initialized evidence as absent, surfaced raw request errors and had no foreground refresh or retained-snapshot state, so an unavailable source/projection could be confused with a successful empty or zero-evidence result.

These pages are descriptive and read-only. Local 7/30/90-day windows and nutrition metric tabs derive only from an already accepted projection and do not request or mutate server state. Health/exercise identity selection does request another server projection and must not silently replace the last accepted view when that request fails.

## Decision

- Share one dependency-free observation read model across health, exercise and nutrition with `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` phases plus offline, 4xx refusal, 5xx outage and unexpected failure families.
- For health and exercise, derive source choices and select the requested/current/fallback identity, then fetch that identity's projection. Publish choices, selected identity and projection together only after the complete read succeeds. A successful source list with a failed projection publishes none of them.
- For nutrition, publish the 90-local-day projection only after its single request succeeds.
- Treat a successful source-list empty result as an accepted empty health/exercise observation. Before acceptance, do not render empty guidance, zero summaries, default identities or a missing-day ribbon.
- Keep a failed-refresh projection only in current page memory and label its exact metric/movement/day extent. Do not clear or overwrite it with a partial response.
- Disable server-backed health/exercise identity changes and the ordinary refresh control while authority is refreshing or stale. Keep 7/30/90-day windows and nutrition nutrient tabs available because they are local views over the retained immutable response and perform no write or network request.
- Retain the exact failed identity-selection intent in memory so one explicit retry can request it again without publishing it early. Foreground reads have concurrent-call and unmount guards.
- Use product-owned copy and one focusable retry. Successful initial reads focus back after the H5 route transition; initial failures focus retry after the same boundary, and later failures focus retry promptly.
- Do not add diagnosis, normal ranges, goals, adherence, progression, nutrition advice, polling, persistent insight cache, background synchronization or mutation replay.

## Consequences

“No confirmed metric”, “no completed movement” and nutrition missing-day/zero summaries now require an accepted service response. A failed selection cannot visually switch the identity while retaining an older projection, and a failed refresh leaves useful evidence visible without claiming it is current. Local exploration remains available during an outage because it cannot change facts or invoke the service.

The shared model/component and three page integrations add 23,041 bytes to H5 and 12,091 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,682,000 H5 and 964,000 WeApp; entry, async, vendor and page ceilings remain fixed.
