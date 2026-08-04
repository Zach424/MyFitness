# ADR-0044: Page current record lists with revision-backed opaque cursors

Date: 2026-08-05

Status: accepted

## Context

The health, workout and meal list routes did not return an entire account history: they silently stopped at 100, 50 and 50 current aggregates respectively. That bounded server work but made every older aggregate unreachable. The three editors also recovered correction drafts by re-listing, so a valid old target could be mistaken for deleted once it fell outside the first response.

Offset pagination would become unstable when occurrence times are corrected or records are deleted between requests. Exposing occurrence timestamps in a client cursor would duplicate sensitive health chronology and make the transport token part of the data contract.

## Decision

- `GET /v1/health-records`, `GET /v1/workouts` and `GET /v1/nutrition/meals` return `{ items, nextCursor }` and accept strict optional `limit` and `cursor` query parameters.
- Calls without query parameters retain the former 100/50/50 limits for compatibility. The three editors request 20 current aggregates initially and expose an explicit load-older action.
- Ordering is total and deterministic: occurrence time descending, aggregate creation time descending, then UUID descending. Migration `0026_record_list_pagination_indexes.sql` aligns the three current-row indexes with that order.
- A cursor is versioned base64url JSON containing only the anchor aggregate UUID and revision. It contains no measurement value, title, occurrence time, user identifier or authorization material.
- The server resolves the exact owner/resource/revision against the immutable revision table and recovers the old occurrence/creation boundary from that snapshot. A correction or soft deletion after cursor issue therefore cannot move or erase the anchor. Invalid, cross-resource, cross-owner or missing-revision cursors fail with `400`.
- A cursor is navigation input, not authentication. Every boundary lookup and page query still applies the authenticated owner.
- New exact current-resource reads return one owner-visible health record, workout or meal by UUID and return `404` for deleted, missing or cross-owner targets.
- Correction-draft restore uses the exact read, requires the stored base revision and preserves normal optimistic concurrency on save. It no longer depends on the target appearing in a list page.
- Client page merging appends only unseen UUIDs. No total count, offset or server-side session state is introduced.

## Consequences

Older current aggregates are reachable without downloading all current history when an editor opens. The cursor remains small and does not disclose sensitive chronology; immutable snapshots make its anchor usable after correction or deletion. Exact reads restore old correction drafts without widening the initial page.

The result is a stable keyset continuation, not a database snapshot of every row for the duration of browsing. A non-anchor aggregate corrected across the boundary may be observed again; client UUID de-duplication prevents a duplicate card. Newly created facts may also appear according to their current ordering on a later fresh load. This is preferable to long transactions or server cursor state for an interactive log.

Revision-history endpoints remain separate and are not paged by this decision. Their growth is the next bounded-history risk.

## Rejected alternatives

- Keep the fixed caps: rejected because old current aggregates remain inaccessible and correction recovery produces false deletion behavior.
- Return every current aggregate: rejected because sensitive payload, memory and query work grow with account age.
- Offset/limit pagination: rejected because corrections and deletions shift offsets and can omit or duplicate rows.
- Put occurrence and creation timestamps in the cursor: rejected because the token would copy sensitive chronology into client storage, logs and URLs.
- Resolve the cursor only from the current table: rejected because deleting the anchor would invalidate an otherwise valid next page.
- Return an exact total: rejected because it adds query work and no editor behavior requires it.
