# Iteration 075: Weekly-plan history read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens Week Fold's older weekly-plan revision continuation and adjacent AI explanation ledger as explicit plan-evidence read authority. Acceptance requires a failed suffix read to retain and label the accepted newest-first plan prefix, freeze the stale cursor, preserve the current plan and explanation provenance, and retry only the exact older-page GET. A successful empty explanation ledger must be visibly confirmed, and no recovery path may regenerate a plan, replay a decision or invoke the AI provider.

The round adds no API/schema/database change, plan-generation rule, AI validator, persistent history cache, polling, mutation replay or coaching/health interpretation. Real identity tenants, managed infrastructure, object custody, telemetry and policy inputs remain parked.

## 2. Structure, technology and design state

- `apps/client/src/pages/plans/index.tsx` now stores one typed continuation failure beside the accepted weekly-plan history prefix and derives checking/ready/continuing/retained-stale presentation through `AggregateHistoryReadState`.
- Ordinary continuation is blocked while the cursor is stale. A separate retry reissues only the failed history read and the shared failure classifier prevents raw transport text from entering page feedback.
- The AI provenance rail renders `EXPLANATION RUNS 0 · ACCEPTED SNAPSHOT` only after the composed plan read has successfully returned an empty explanation array.
- The wide evidence artifact keeps the current plan, explanation receipt, focused recovery control and ten retained decision revisions in one frame.
- The H5 total budget moves from 2,745,000 to 2,752,000 bytes and the WeApp page limit from 56,000 to 56,100 bytes; entry, async, WeApp total/vendor and forbidden-marker constraints remain unchanged.

## 3. Implementation method

### Preserve the accepted decision prefix

The existing first plan read remains atomic and already owns the current plan, first history page and explanation ledger. Only the continuation path gains failure state. A suffix failure therefore leaves the accepted array untouched, records the bounded failure family and derives `stale` instead of writing a generic error or clearing history.

### Freeze and retry the exact cursor

The ordinary older-version control refuses activation while failure exists and carries explicit disabled semantics. The recovery action uses the same still-held cursor and only calls the history GET; success appends unseen revisions and replaces the cursor atomically. The test verifies that two history reads occur and that no AI explanation POST occurs.

### Keep evidence authorities independent

The current plan and AI explanation history came from the successful initial composed read, so a later plan-history suffix outage does not revoke them. The current-plan actions remain governed by the existing page authority and plan recovery matrix. An empty explanation list now receives a quiet accepted-snapshot line instead of disappearing, but it cannot appear before successful initial authority.

### Preserve focus and visual hierarchy

Continuation failure focuses the stable recovery ID. At wide viewport the amber receipt sits above the retained version list in the right evidence column while the current plan remains in the wider workbench. The retry outline, retained count and frozen-cursor copy communicate state without relying on color.

## 4. Validation evidence

- Repository-wide unit validation passed 72 files / 362 tests; PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, API build and administrator build passed.
- The complete plan browser file passed 14/14. The complete main H5 browser suite passed 82/82 in 2.6 minutes; OIDC passed 3/3 after its dedicated build, retaining 85 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Standard H5 was restored after OIDC validation; known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,750,750 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 1,002,510, vendor 18,915 and largest page 56,044. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-075-plan-history-stale-wide.png`.

## 5. Problems found and experience captured

- A retained history array is not enough: its cursor authority must be visible and frozen after failure or the UI implies that continuation is still safe.
- Related evidence does not share every failure boundary. A failed plan-revision suffix does not invalidate an already accepted current plan or explanation ledger.
- A zero-length audit list needs a successful-read receipt. Rendering nothing cannot distinguish confirmed absence from an unimplemented, loading or unavailable section.
- Read recovery must be proven by negative side effects as well as positive rows. Counting explanation writes demonstrates that a history retry cannot silently spend model budget.
- A small shared-state import can move total H5 output even when entry and largest async artifacts remain flat. Narrowly adjust only the measured budget dimension.
- Request-generation guards must cover rejection and finalization as well as success. Otherwise a late failure can poison a newer accepted plan snapshot or clear its active loading state.
- Full browser runs overwrite historical screenshots with fixture dates; tracked artifacts were restored and only the new iteration evidence remains.

## 6. Global state review, remaining risks and next step

All current user-facing aggregate, definition and weekly-plan history continuations now distinguish unknown, accepted, in-progress and retained-stale evidence without raw transport copy. Plan history remains descriptive audit evidence and cannot establish adherence, plan quality or safety.

The next local gap is keyboard focus ownership in the body/recovery, workout and meal history dialogs. Their retry paths focus recovery correctly, but a successful open does not yet move to one safe close control and closing does not return to the exact history trigger. Iteration 076 should unify safe entry, Escape/explicit/scrim close and trigger return without altering history data or parent mutation authority. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-075 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 074 archive](074-owner-definition-revision-ledger-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0047](../architecture/decisions/0047-stable-weekly-plan-history-pagination.md)
- [ADR-0070](../architecture/decisions/0070-weekly-plan-history-read-authority.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
