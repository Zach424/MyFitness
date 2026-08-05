# ADR-0067: History-calendar read authority

Date: 2026-08-05

Status: accepted

## Context

The history route initialized its summary to four zero values before `GET /insights/history-calendar` succeeded. If the first read failed, the page combined those zeros with “no calendar,” turning unavailable cross-domain evidence into an apparent successful empty result. If a later refresh failed, the last calendar remained mounted but was not labeled stale; date selection and all three backfill routes stayed active against an unverified range.

The projection is derived from sensitive current facts across body/recovery, workouts and meals. Its date range and IANA timezone also authorize a bounded backfill intent, so retaining the pixels is not equivalent to retaining permission to act on them.

## Decision

- Treat the 28-day response as one atomic page-memory snapshot containing range, timezone, generated series and derived totals. No partial or zero fallback may become accepted authority.
- Apply initial-loading, ready, refreshing, initial-error and stale phases plus product-owned offline, refusal, service and unknown failure copy.
- Before the first successful response, render an unverified calendar surface and em-dash summary values. Do not render 28 blank days, “no calendar” or zero record counts.
- Keep the last successful snapshot mounted during a guarded foreground refresh. If it fails, label the exact retained range/timezone and keep its record marks and selected-day explanation readable.
- Only the ready phase may change the selected local date or navigate to body/recovery, workout or nutrition backfill. Both the rendered controls and their callbacks enforce that boundary.
- One explicit retry repeats only the read. Overlapping reads are ignored, results after unmount are discarded and H5 focus moves to the stable back or retry action.
- Do not persist the projection, selected date, response, failure or retry command; do not poll, refresh in the background or replay a backfill action.

## Consequences

A transport or service failure can no longer claim that the user has zero recorded days. A retained calendar remains useful evidence while visibly losing action authority until one current response succeeds. The API, database, 28-day query, backfill contract and source-record lifecycle do not change.

The dedicated lazy-route implementation was retained after measurement showed that importing the existing shared observation component duplicated route assets and increased H5 output by about 4 KB. The final page-only change raises measured H5/WeApp totals to 2,714,001/996,818 bytes. H5 entry/largest async JavaScript remain 319,235/207,097 bytes; WeApp vendor/largest page remain 18,915/55,523 bytes. Only total ceilings move to 2,715,000 and 997,000 bytes.

## References

- [ADR-0043](0043-timezone-safe-history-calendar.md)
- [ADR-0057](0057-today-read-snapshot-authority.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
