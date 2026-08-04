# ADR-0041: Explicit local occurrence time with an IANA timezone boundary

Date: 2026-08-05

Status: accepted

## Context

The body/recovery, meal and workout editors previously generated occurrence instants at save time. That was convenient for immediate entry but made backfill impossible and hid an important fact when correcting a record. A local clock value alone is not an instant: it needs a timezone, can fall inside a daylight-saving gap, and can occur twice when clocks move backward.

The same interaction must work in H5 and WeChat Mini Program without adding a large date library to already measured client bundles. Saved offset timestamps and IANA timezone names remain part of the existing API and database contracts.

## Decision

1. Give all three editors an explicit `YYYY-MM-DD HH:mm` local-time input and editable IANA timezone. A blank create input means the current instant at submission; repeat starts blank/current rather than copying the source record's time.
2. Resolve local time with the platform `Intl.DateTimeFormat` timezone database. Validate calendar fields first, sample possible offsets around the requested date, and round-trip each candidate through the timezone. A time with no candidate is a daylight-saving gap; a time with two candidates requires the user to choose the displayed UTC offset.
3. Reject malformed dates, invalid timezones, nonexistent local times, unresolved repeated times and future instants before submission. Shared Zod create/update contracts independently reject future health-record, meal, workout-start and workout-end instants at the API boundary.
4. Workouts expose separate start and end inputs. If both are blank, create a 45-minute session ending now. If one is blank, derive the missing endpoint from the entered endpoint; all paths still enforce end-at-or-after-start and neither endpoint may be in the future.
5. When correction begins, format the stored instant in its stored timezone and retain the exact original offset timestamp separately. If the user does not change the local minute, timezone or selected offset, resubmit the original instant byte-for-byte so minute-only UI does not silently discard seconds or milliseconds. Any occurrence edit clears that preservation value and the idempotency key.
6. Persist only the whitelisted local input, timezone, optional selected offset and bounded original instant in the existing 24-hour draft envelope. They are sensitive editor fields governed by ADR-0040, not a new persistence authority.
7. Keep the resolver dependency-free and share one lazy occurrence-field component across the three H5 routes. Initialize timezone runtime once from the application entry so the existing H5/WeApp quality budgets remain unchanged.

## Consequences

Users can record past evidence and correct when evidence occurred without confusing it with server creation time. DST gaps fail visibly, repeated minutes become an explicit choice, and the API receives one unambiguous offset timestamp plus the recorded IANA zone. Corrections preserve the server fact unless the user deliberately edits it.

The UI is minute-granular, so it cannot enter seconds directly. Exact existing seconds/milliseconds are nevertheless preserved on an untouched correction. Timezone accuracy depends on the platform's `Intl` timezone data; real WeChat devices and supported browsers still require release-stage compatibility proof.

The final measured production trees remain inside the unchanged gates: H5 is 2,278,714 bytes total, 318,290 entry bytes and 199,409 bytes for the largest async JavaScript chunk; WeApp is 769,873 bytes total, 18,915 vendor bytes and 44,817 bytes for the largest page JavaScript.

## Alternatives rejected

- Save every entry as “now”: prevents backfill and makes correction semantics misleading.
- Accept a local clock without a timezone: cannot identify one global instant and fails across travel or DST.
- Guess the earlier/later repeated DST instant: silently changes the user's fact.
- Convert with the host machine's implicit timezone: produces different records on different devices.
- Add a date/time dependency immediately: increases both client bundles for behavior available through validated `Intl` round trips.
- Reformat every corrected timestamp to minute precision: rewrites untouched server evidence and loses seconds/milliseconds.
