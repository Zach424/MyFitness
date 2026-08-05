# ADR-0079: Bounded consent-receipt history

Date: 2026-08-05

Status: accepted

## Context

The privacy overview intentionally returns only the latest consent state for each purpose, while portable export v4 contains every append-oriented consent row. Users could count those receipts in the ownership inventory but could not inspect their acceptance/revocation intervals without downloading and reading the full sensitive export.

Historical evidence must not become another current authorization source. Pagination also has to survive newly accepted receipts, same-instant database writes and a cursor copied between accounts without exposing user, provider or health content.

## Decision

- Add authenticated `GET /v1/me/privacy/consents/history` with a strict default of 10 and maximum of 20 items.
- Return only receipt UUID, purpose, bounded version, acceptance time and optional revocation time. Do not return a current-status field, account/provider identifier, cleanup result or health data.
- Sort by `(accepted_at DESC, id DESC)` and add the matching owner covering index.
- Encode only cursor schema version plus receipt UUID in base64url. Resolve that receipt under the authenticated owner and reject malformed, missing or foreign anchors with the same bad-request boundary.
- Keep the complete tuple comparison inside PostgreSQL. Do not round-trip the anchor timestamp through JavaScript, whose millisecond precision can skip rows written in the same PostgreSQL microsecond range.
- Keep the privacy overview as the sole current consent authority used by revocation controls. Label every client history item as an accepted receipt or revoked interval and repeat that no-revocation-time history does not prove current status.
- Load history only after explicit expansion, page it in React memory, deduplicate by receipt UUID and persist no history snapshot or cursor.
- A new accepted head may appear before an issued cursor without disturbing its older suffix. Account erasure remains the only deletion path for the receipt graph.

## Consequences

Users can inspect a bounded chronology without downloading their entire portable data graph, while history cannot authorize or replay a consent mutation. The new endpoint has one additional owner/time/UUID index but no new business table or write path.

Unit tests cover the strict contract, opaque cursor and migration order. PostgreSQL integration proves server-confirmed empty history, 2-item continuation across six original receipts, a later inserted head that does not enter the issued suffix, exact deduplication, and malformed/cross-owner rejection. Real H5 proves empty, accepted/revoked and 10-to-12 continuation states without rendering the account UUID.

H5 total moves from 2,787,260 to 2,797,774 bytes and WeApp from 1,052,864 to 1,061,330. Narrow total ceilings become 2,801,000 and 1,064,000; H5 entry/largest async remain within 320,000/206,000 and WeApp vendor/largest page remain within 25,000/56,100.

## References

- [ADR-0011](0011-user-owned-export-and-erasure.md)
- [ADR-0059](0059-privacy-custody-read-authority.md)
- [ADR-0077](0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0078](0078-portable-export-client-artifact-validation.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
