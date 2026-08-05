# Iteration 071: Profile/goal register read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the adult profile, goals, planning constraints and safety eligibility editor as one revisioned owner register. Acceptance requires a confirmed absence to remain distinct from an unavailable read, initial failure to publish no default personal facts, a failed refresh to retain and label the accepted base while freezing save, local draft intent to survive only in page memory and revision drift to require an explicit resolution instead of automatic rebasing.

The round adds no API/schema/database change, persistent onboarding draft, background synchronization, polling, automatic PUT replay, medical interpretation or new consent purpose. Real identity tenants, hosted callbacks, policy owners and managed deployment remain parked.

## 2. Structure, technology and design state

- `onboarding.model.ts` adds base-revision equality and purpose-owned four-family read copy while reusing the dependency-free five-phase register state machine.
- The onboarding page now keeps accepted authority (`undefined`, confirmed-absent `null`, or response), draft base revision, local-dirty state, drift state and read activity separate.
- One compact `PROFILE BASE` receipt, authority card, confirmed-absence note and drift resolution panel extend the existing three-sheet logbook design without changing its data fields.
- A 390 × 844 artifact shows the form completely absent during an initial transport outage. A 1440 × 1000 artifact shows profile v1 plus a local edit retained beneath a failed refresh with save authority removed.

## 3. Implementation method

### Make absence an accepted fact, not a falsy shortcut

The client now treats unread, confirmed absent and accepted response as different states. `GET` 404 or a server-verified new identity publishes confirmed absence; the default age, goal, rhythm and safety choices become visible only below an explicit “unsubmitted starter draft” note. Any other initial failure retains the internal placeholder only as implementation state and renders no form, progress steps, zero/empty claim or save path.

### Preserve edits without preserving stale write permission

A guarded foreground refresh leaves the accepted response and React draft mounted. Failure classifies into offline/refused/service/unknown, labels the retained revision or absence and freezes PUT through both disabled semantics and an in-function authority guard. Step navigation and editing remain available because they are page-local; the browser proof verifies the edited display name appears in no local-storage value and that refresh emits zero PUTs.

The current accepted revision and the draft base are compared after every successful refresh. If they match, local edits remain eligible for a later explicit save. If another client advanced the register, the latest response is accepted for evidence but the old-base draft is neither overwritten nor rebased. One explicit action discards the local edit and hydrates the latest response.

### Reconcile optimistic conflicts without replay

The API already locks `user_profiles` and requires exact `expectedRevision` for an existing row. A client PUT conflict therefore triggers one GET. Real API proof advances v1 to v2 outside the page, observes the page PUT return 409, confirms the local draft remains, confirms save freezes and then loads v2 only after the user chooses the destructive local-draft action. No automatic save or request replay occurs.

### Keep focus and visual authority legible

Initial failure focuses the only retry after the Taro route settles; a failed refresh focuses retry promptly. Visual review corrected a flex-sizing defect that squeezed the receipt label into a vertical strip on wide H5, and the screenshot resets the nested scroll container after input focus so the authority, retained draft and explanation rail share one complete frame.

## 4. Validation evidence

- Focused onboarding model validation passed 5/5; repository-wide unit validation passed 71 files / 359 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Five onboarding real-service browser checks passed: existing create/safety and wide layout plus initial offline recovery, retained stale draft and v1→v2 conflict reconciliation.
- The complete main H5 browser suite passed 76/76 in 2.4 minutes. The dedicated OIDC suite passed 3/3; the repository now retains 79 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,704,938 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 988,146, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-071-profile-register-offline-mobile.png` and `iteration-071-profile-register-stale-wide.png`.

## 5. Problems found and experience captured

- A complete-looking form is not harmless skeleton UI when its defaults resemble personal facts. Unknown authority must suppress the form, not merely add an error message above it.
- Confirmed absence is a useful positive fact. Encoding it as `null` while reserving `undefined` for unread makes the state machine and write gate auditable.
- Retaining a draft and retaining permission are separate decisions. Local edits may remain useful during outage while the current server revision is unavailable.
- Refresh success cannot silently rebase edits onto a new revision; that would defeat optimistic concurrency at the presentation layer even if the API remains safe.
- A 409 is evidence that the base is stale, not permission to retry the mutation. One read reconciliation can establish current evidence without repeating the write.
- Tests initially exercised a stale H5 build and correctly reproduced the old bug. Browser tests must rebuild the product artifact before interpreting UI failures.
- Wide screenshots exposed a receipt flex child shrinking to min-content while its button expanded. Explicit summary flex and fixed action basis restored the intended evidence hierarchy.
- A retained label appears in both toolbar and state receipt; Playwright assertions need exact matching so duplicated truthful copy does not create brittle ambiguity.

## 6. Global state review, remaining risks and next step

The profile/goal register now joins record ledgers, owner definitions, long-term observations, privacy custody, Today, Week Fold and private-photo inventories in distinguishing unknown, confirmed-empty/absent, refreshing, stale and ready evidence. Profile drafts intentionally remain less recoverable than record-entry drafts because they contain broad identity, risk and consent intent; this round adds no local persistence.

The next local authority gap is the 28-day cross-domain history calendar. Its failed first read currently falls through to zero totals and “no calendar,” while a failed refresh keeps date selection/backfill active without labeling the old range. Iteration 072 should make the 28-day projection atomic, suppress zero/empty summaries until success, retain a labeled page-memory range after refresh failure and freeze selected-day/backfill actions until authority returns. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-071 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 070 archive](070-private-photo-inventory-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0003](../architecture/decisions/0003-identity-onboarding-boundary.md)
- [ADR-0066](../architecture/decisions/0066-profile-goal-register-read-authority.md)
- [Identity and onboarding model](../architecture/IDENTITY_PROFILE_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
