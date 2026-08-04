# Iteration 043 — Explicit occurrence-time recording

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Body/recovery, meal and workout editors previously used the save-time clock, so users could not backfill evidence and correction hid when a record occurred. Iteration 043 adds explicit local occurrence time and IANA timezone control to all three editors.

Success requires dependency-free local-to-instant conversion; invalid calendar/timezone and future-time rejection; visible daylight-saving gap/overlap handling; distinct workout start/end semantics; exact preservation of untouched correction timestamps; safe repeat/current-time behavior; bounded draft persistence; unchanged API/database shape; H5 and WeApp bundle gates; and real-browser proof of the submitted instants.

This round does not add calendar browsing, device time synchronization, server-side drafts, cloud services, real providers or medical interpretation.

## 2. Structure, technology and design state

- `apps/client/src/lib/occurrence-time.ts` owns local parsing, IANA resolution, DST candidate detection, future checks, formatting and untouched-instant preservation.
- `apps/client/src/components/occurrence-field/` renders the shared `LOCAL TIME / IANA ZONE` ticket, inline validation and explicit UTC-offset choices.
- The three page models now produce offset timestamps from local input. Workout creation derives sensible endpoints when one or both fields are blank; repeats reset occurrence input to current-time behavior.
- Record, nutrition and workout contracts add an independent server-side future-instant backstop. No migration or response shape changed.
- Existing owner-scoped draft guards whitelist local input, timezone, optional UTC offset and bounded original instant; time changes reset request identity and stale feedback.
- H5 webpack emits the occurrence field as one forced asynchronous shared component chunk, while application startup initializes the timezone runtime once. Existing checked-in budgets remain unchanged.
- ADR-0041, architecture, record models, privacy/design notes, roadmap, README and global status describe the same occurrence boundary.

Technology remains TypeScript strict mode, Taro 4/React, platform `Intl.DateTimeFormat`, Zod 4, Vitest and Playwright. No runtime package, data source, provider or database table was added.

## 3. Implementation method

### Resolve a local minute into evidence, not an assumption

Input accepts exactly `YYYY-MM-DD HH:mm` (or a separating `T`) after validating real Gregorian calendar fields. The resolver samples timezone offsets across ±72 hours, converts each possible instant back through `Intl.DateTimeFormat` and retains only exact local-minute round trips. Zero candidates means a DST spring gap. Multiple candidates mean a repeated clock minute, and the interface requires the user to choose `UTC±HH:mm` before saving.

A resolved candidate is checked against the current clock. Blank create input remains ergonomic and becomes the submission instant, while all explicit values are stable offset timestamps. The API contracts repeat the future check so a modified or older client cannot bypass it.

### Preserve correction precision

The editor displays saved instants at minute precision but stores the exact source instant beside the form. If local minute, timezone and selected offset still describe that source, update resubmits the original string, including seconds/milliseconds. Editing any occurrence control drops the preservation value, clears old success/error feedback and creates a new idempotency key before resolving a replacement instant.

Workout start and end are independent. Both blank means `now − 45 minutes` through `now`; one blank derives the missing endpoint from the supplied one. The existing end-before-start rule and new future checks apply after resolution.

### Keep time code shared without breaking delivery budgets

Importing one formatter/resolver through three lazy routes initially duplicated enough code to push client budgets to their edge. The final build initializes detected timezone once in `app.tsx`, and H5 groups the visual occurrence component into one async cache group. Minor duplicated styles were consolidated. The result stays below all existing total, entry, async, vendor and page limits without relaxing a threshold.

## 4. Validation evidence

- Focused occurrence/model/draft validation passed 5 files / 24 tests; expanded contract/model coverage passed 8 files / 40 tests. Cases cover normal offsets, calendar rejection, invalid zones, DST gap, DST repeated-minute choice, future rejection, default/derived workout endpoints and exact correction preservation.
- Repository-wide unit validation passed 55 files / 249 tests.
- PostgreSQL integration validation passed 17 files / 59 tests. Five time-sensitive fixtures were moved to stable historical timelines; the plan test now finds its aggregate by ID instead of assuming list position.
- Strict TypeScript passed across all six product/shared workspaces; formatting passed.
- Main H5 browser validation passed 33/33 and dedicated OIDC passed 3/3, for 36 browser cases. The three real record lifecycles verify exact Shanghai conversions; health-record coverage also rejects a future value and requires an explicit offset for `America/New_York`'s repeated `2025-11-02 01:30` minute.
- H5 and WeApp production builds passed. Client quality measured H5 `2,278,714` total bytes, `318,290` entry bytes and `199,409` largest async JavaScript; WeApp `769,873` total bytes, `18,915` vendor bytes and `44,817` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-043-occurrence-time-mobile.png`.

## 5. Problems found and experience captured

- A civil clock value is not an instant. Correct conversion must prove a round trip in the named timezone and expose overlap choices rather than selecting one silently.
- Minute-granular editing can corrupt high-precision history even when the visible value looks unchanged. Retaining and verifying the original instant prevents accidental evidence rewrites.
- Future validation made several integration fixtures fail because “today at 18:00” was future when CI ran earlier that day. Time-window fixtures should use a stable historical reference, and list assertions should identify aggregates instead of depending on date sorting.
- Clearing idempotency only after submission is too late. Any time/zone/offset change must also clear the key and stale feedback so the next request represents a new fact.
- Shared source code can still be duplicated across emitted lazy routes. Production-tree measurement, rather than import structure, determines whether sharing succeeded.
- Platform `Intl` avoids a dependency but transfers compatibility risk to runtime timezone data; real-device proof remains mandatory before release.

## 6. Global state review, remaining risks and next step

The three primary recording domains now support explicit backfill and occurrence correction with the same timezone boundary. Calendar-oriented history browsing is still limited, and unsaved correction forms are not yet recoverable. H5/WeApp application-storage security, device timezone-data coverage and real-device input behavior remain release risks.

The next locally verifiable data-loss gap is correction-draft recovery. Iteration 044 should extend the existing vault with aggregate ID and base revision, restore only against the same current owner/revision, refuse stale server targets and preserve optimistic conflict behavior. Managed deployment remains parked pending owner-operated account, domain, credential, custody and telemetry inputs.

## 7. References

- [Iteration 042 archive](042-recoverable-sensitive-local-drafts.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [Health-record model](../architecture/HEALTH_RECORD_MODEL.md)
- [Workout model](../architecture/WORKOUT_MODEL.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [ADR-0040](../architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [ADR-0041](../architecture/decisions/0041-explicit-occurrence-time.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
