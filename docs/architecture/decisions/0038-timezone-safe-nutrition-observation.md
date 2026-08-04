# ADR-0038: Timezone-safe nutrition observation with explicit missing evidence

Date: 2026-08-05

Status: accepted

## Context

The meal aggregate already freezes food composition, portions and provenance into current relational rows plus immutable revisions. The dashboard could total meals over elapsed 7/30/90-day windows, but it could not show which local calendar days contained evidence, whether a blank day meant no record, or whether a later correction/deletion changed the current longitudinal view.

Filling absent days with numeric zero would overstate what the product knows about intake. Fiber is also optional on a food snapshot, so summing missing labels as zero would create a second false fact. Persisting a daily rollup would duplicate sensitive data and introduce synchronization work for every meal replacement or soft deletion.

## Decision

1. Expose an owner-authenticated read projection at `GET /v1/insights/nutrition` with the shared valid-IANA-timezone and optional reference-instant query contract.
2. Generate exactly 90 consecutive local calendar dates in PostgreSQL, ending on the requested instant's date in that timezone. Join only owner-visible, current, non-deleted meals whose occurrence time is not later than the reference instant.
3. Treat saving a meal as the user-confirmation boundary. Manual and imported snapshots can contribute only after they exist in the meal aggregate; photo candidates and unsaved drafts never contribute.
4. Return one point for every generated date. A date with no meal has `hasEvidence: false`, zero record counts and `null` nutrient fields. It is never represented as zero intake.
5. Keep fiber coverage explicit with `fiberKnownItemCount` and `itemCount`. Sum known fiber values only; return `fiberG: null` when no item on that day/window carries fiber evidence.
6. Derive 7/30/90-day windows from the same 90 returned points. Each window exposes recorded/missing day counts, meal/item counts and nutrient totals. The client may show a clearly labelled recorded-day average; it must not divide by missing days or call the result complete intake.
7. Recompute from normalized current meal/item rows on every read. Meal correction replaces the current item graph and soft deletion removes the meal, so no materialized trend state or new privacy-export collection is created.
8. Render the result on a dedicated lazy H5/WeApp page using an evidence ribbon whose filled, missing and unknown-fiber states remain distinguishable without a target or adherence score.
9. Do not set calorie/macro targets, judge food quality, compare users, diagnose nutrition status, infer complete intake or generate dietary advice from this projection.

## Consequences

The user can now inspect correction-safe daily evidence while seeing the limits of that evidence. Calendar windows remain meaningful across offset and daylight-saving changes because grouping uses the requested local date, not fixed 24-hour buckets. The fixed 90-point response is bounded and requires no new stored sensitive state.

The projection still depends on the completeness and accuracy of user records and food snapshots. Totals can be partial, especially for fiber, and recorded-day averages are not population references or recommendations. Longer retention views, targets, adherence logic and clinical nutrition interpretation require separate product, safety and evidence decisions.

The extra lazy route raises only total client-tree budgets: H5 moves to 2.10 MB and WeApp to 735 KB. Existing 320 KB H5 entry, 200 KB asynchronous JavaScript, 25 KB WeApp vendor and 45 KB WeApp page-JavaScript limits remain unchanged.

## Alternatives rejected

- Fill missing dates with zero nutrients: turns absence of evidence into a false intake claim.
- Divide window totals by every calendar day: silently treats missing days as zero and understates recorded-day values.
- Omit missing days: hides the observation gap and makes day spacing misleading.
- Persist daily summaries: duplicates sensitive facts and risks stale correction/deletion results without measured scale pressure.
- Use the meal's recorded timezone for grouping: makes one requested chart mix date systems; the projection instead states and consistently applies the viewer-requested timezone.
- Add goals, streaks or green/red thresholds: creates unsupported adherence pressure and crosses the bounded observation scope.
