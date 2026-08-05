# Iteration 072: History-calendar read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the 28-day cross-domain history calendar as one timezone/range read authority. Acceptance requires an initial failure to remain unknown rather than becoming zero recorded days or “no calendar,” a failed refresh to retain exactly one labeled accepted snapshot, its recorded-day evidence to remain readable and selected-day changes plus body/training/nutrition backfill to stay frozen until a current response succeeds.

The round adds no API/schema/database change, persisted projection cache, polling, background refresh, automatic navigation replay, adherence score or new health inference. Real identity tenants, managed infrastructure, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `history.model.ts` adds dependency-free four-family failure classification and purpose-owned calendar copy alongside existing date, accessible-label and total helpers.
- The history page now separates an accepted `HistoryCalendar`, selected local date, read activity and failure state; an in-flight guard and page-lifecycle guard protect the single foreground request.
- A compact accepted-range toolbar, ruled authority receipt, unverified evidence map and em-dash summary extend the existing `HISTORY LEDGER / 28D` sheet.
- A 390 × 844 artifact shows initial transport loss without zero or empty claims. A 1440 × 1000 artifact shows one accepted Asia/Shanghai range and recorded body day retained read-only after a 503 response.

## 3. Implementation method

### Make the projection atomic

Before the first successful response, timezone, range, all 28 dates and four totals remain unverified. The calendar card keeps its visual place but publishes no day controls; the summary uses em dashes and the selected-day card says the date is awaiting verification. Only a complete response replaces this state and derives its totals.

### Retain evidence without retaining action permission

A refresh never clears the accepted snapshot first. If the request fails, product-owned copy labels the retained range and timezone while the exact day marks, totals and selected-day explanation remain visible. Every date button and all three backfill actions use disabled semantics plus an in-function ready-phase guard, so retained pixels cannot issue a stale navigation intent.

### Bound retry and focus

The page ignores overlapping reads and results after unmount. Initial failure focuses the single retry after the Taro route settles; stale failure focuses it promptly. Retry performs one GET and does not remember a command, poll, write local storage or replay a prior date/backfill click.

### Measure the lazy route before changing budgets

An attempted reuse of the shared observation-state component reduced the WeApp history page but duplicated shared H5 route assets, increasing total output by about 4 KB. The dedicated page-local presentation is smaller for the shipped pair. Relative to iteration 071, final H5/WeApp totals grow by 9,063/8,672 bytes while entry, largest async JavaScript, vendor and largest page remain unchanged; only total ceilings move to the next measured thousand.

## 4. Validation evidence

- Focused history model validation passed 3/3; repository-wide unit validation passed 71 files / 360 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Three history real-service browser checks passed: initial offline recovery, retained stale map and the existing cross-domain backfill lifecycle.
- The complete main H5 browser suite passed 78/78 in 2.5 minutes. The dedicated OIDC suite passed 3/3; the repository now retains 81 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,714,001 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 996,818, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-072-history-calendar-offline-mobile.png` and `iteration-072-history-calendar-stale-wide.png`.

## 5. Problems found and experience captured

- Zero is a domain fact, not a loading placeholder. A failed aggregate read must keep every count unknown until the server returns the complete range.
- A retained projection may remain valuable for reading while being unsafe as navigation authority. Visibility and permission require separate state.
- Range and timezone belong in the stale receipt because they define the meaning of every retained calendar cell and the destination backfill intent.
- Disabled presentation alone is insufficient with Taro's custom H5 button. Event callbacks must independently check the ready phase.
- The selected local date is page state, but changing it during a stale response can make the retained snapshot look interactive and current; freezing it keeps the evidence receipt coherent.
- Reusing a source component does not guarantee a smaller multi-route bundle. Both H5 chunk topology and WeApp page output must be measured before accepting a refactor.
- Full browser runs overwrite historical screenshots with current fixture dates. Restore tracked evidence after regression and commit only the new iteration artifacts.

## 6. Global state review, remaining risks and next step

The cross-domain calendar now joins Today, Week Fold, privacy custody, record ledgers, owner registers, long-term observations, private-photo inventories and the profile/goal register in separating unknown, ready, refreshing and retained-stale evidence. The 28-day projection remains recomputed, owner-scoped and non-persistent; a blank accepted day still means only that no qualifying record exists.

The next local evidence gap is the per-aggregate revision sheet shared conceptually by body/recovery, workouts and meals. An initial history-read failure currently closes or clears the requested audit surface, continuation failures rely on a page-level message and retained revision rows are not labeled as a bounded stale history snapshot. Iteration 073 should preserve the requested aggregate context, distinguish unread from accepted-empty audit evidence, retain loaded immutable revisions after continuation/refresh failure and expose focused retry without permitting stale continuation or mutation coupling. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-072 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 071 archive](071-profile-goal-register-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0043](../architecture/decisions/0043-timezone-safe-history-calendar.md)
- [ADR-0067](../architecture/decisions/0067-history-calendar-read-authority.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
