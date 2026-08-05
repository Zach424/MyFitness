# Iteration 070: Private-photo inventory read authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round hardens the purpose-separated food-photo candidate list and progress-photo contact sheet as explicit private-inventory authorities. Acceptance requires successful-response-only empty language, retained but labeled page-memory snapshots after refresh failure, frozen inventory-dependent media/custody actions, product-owned failure families, foreground accessible recovery and real API proof for both route variants.

The round adds no API/schema/database change, photo cache, file/path persistence, polling, background synchronization, automatic media replay, body inference, nutrition fact or physical-deletion claim. Production object storage, cloud accounts, real providers and real-device permissions remain parked.

## 2. Structure, technology and design state

- `private-inventory-read.ts` owns five phases, four failure families and purpose-specific copy without React, Taro or network dependencies; two focused tests cover the complete matrix.
- One lazy `PrivateInventoryReadToolbar`/`PrivateInventoryReadState` pair adds a quiet inventory receipt, explicit update, retained extent and one retry to both private-photo variants.
- The food workbench accepts the complete reviewable-candidate response before choosing a visible proof. The progress route accepts its full owner list before showing capture, comparison or contact-sheet content.
- A 390 × 844 artifact records an initial food-proof transport outage without an intake/empty claim. A 1440 × 1000 artifact records one retained progress photo beneath a service-outage receipt with capture/comparison/delete controls frozen.

## 3. Implementation method

### Make successful reads the only empty-state authority

Both pages keep `hasSnapshot`, read-busy and classified-failure state separate from their item arrays. Initial `undefined`/`[]` values are implementation placeholders only. Until the first complete response succeeds, the normal workbench content is absent and one explicit authority card reports unknown custody.

Food inventory publication preserves an edited review draft when the same proof remains present and otherwise selects the current proof, a ready proof or the first returned item in that order. Progress publication removes comparison IDs only when the accepted response no longer contains the matching retained photo.

### Retain evidence without retaining permission

A foreground refresh leaves the accepted inventory mounted. If it fails, the receipt names the retained item count and every inventory-dependent callback has both disabled semantics and an in-function guard. Food reservation, candidate choice/grams, confirmation and deletion freeze. Progress capture intent, baseline/current assignment and deletion freeze; a previously composed overlay remains a local visual control and makes no service request.

Direct successful upload/delete responses update the page-memory inventory, while ambiguous operations continue through the existing same-request or reconcile-first matrix. Reconciliation list reads can replace the accepted snapshot but never replay image bytes or infer physical deletion from absence.

### Keep recovery bounded and legible

Transport, refusal, service and unknown families use product-owned copy and never expose raw service text. Ready pages have one guarded update action; unknown/stale pages have one retry. Initial success focuses back after the route settles, initial failure focuses retry, and later failed refresh focuses retry promptly. Shared focus styling covers programmatic focus as well as keyboard `:focus-visible`.

### Rebaseline only measured lazy-route growth

H5 total grows from 2,681,179 to 2,691,432 bytes and largest async JavaScript from 199,198 to 207,097; entry remains 319,235. WeApp total grows from 963,138 to 974,386, while vendor and largest page remain 18,915 and 55,523. Only H5 total/async and WeApp total ceilings move to 2,692,000/208,000 and 975,000.

## 4. Validation evidence

- Focused private-inventory and both photo model files passed 3 files / 9 tests; repository-wide unit validation passed 71 files / 357 tests.
- PostgreSQL integration validation passed 19 files / 62 tests; AI service validation passed 7/7.
- Strict workspace TypeScript, repository formatting, administrator build and API build passed.
- Six targeted real-service browser checks passed across the two new authority cases and the existing food/progress upload, confirmation, deletion and response-loss paths.
- The complete main H5 browser suite passed 73/73 in 2.6 minutes. The dedicated OIDC suite passed 3/3; the repository now retains 76 browser tests.
- Normal H5, OIDC H5 and WeApp production builds passed. Known non-blocking Taro entry-size/cache warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,691,432 bytes, entry 319,235 and largest async JavaScript 207,097; WeApp total 974,386, vendor 18,915 and largest page 55,523. Forbidden runtime-marker scans are empty.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-070-food-inventory-offline-mobile.png` and `iteration-070-progress-inventory-stale-wide.png`.

## 5. Problems found and experience captured

- An empty array is not a product fact until the owner list request succeeds; rendering a polished empty state can conceal a serious custody-authority bug.
- Operation-specific write recovery starts too late to protect a page that never established its initial read authority. Read and write authority must compose, not substitute for each other.
- Retaining sensitive evidence and retaining permission are different decisions. A stale photo can remain visibly useful while every custody-changing action is frozen.
- A local overlay-opacity slider is not equivalent to selecting a new comparison pair. Classifying controls by whether they contact the service or change custody avoids an unnecessarily dead page.
- Refreshing the same food proof should not discard the person's unconfirmed gram edits. Stable proof identity is the correct preservation boundary; a different proof gets a fresh review draft.
- Programmatic focus can match `:focus` without matching browser `:focus-visible`; the recovery control needs a visible indicator for both paths.
- A deliberately fulfilled 503 produces one expected browser resource error. Tests should filter only that injected status, not suppress unrelated console or page failures.
- Full browser regression rewrites historical screenshots. Restore all tracked test artifacts and retain only the two files explicitly reviewed for the current iteration.

## 6. Global state review, remaining risks and next step

All main record ledgers, mutable definition registers, long-term observations, privacy custody, Today, Week Fold and both private-photo inventories now distinguish unknown, successful-empty, refreshing, stale and ready evidence where relevant. Media bytes remain private, purpose-scoped and outside local recovery storage; list absence still does not prove object deletion completion.

The next uncovered overwrite risk is the profile/goal register. The onboarding/editor route currently renders default profile and goal values after a non-404 read failure, which can make an existing sensitive profile look new and permit a save without an accepted base revision. Iteration 071 should distinguish confirmed absence from unavailable profile evidence, retain a labeled accepted revision after failed refresh, freeze submission until authority returns and preserve user-entered edits without silently applying defaults. Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-070 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 069 archive](069-long-term-observation-read-authority.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0010](../architecture/decisions/0010-revocable-food-photo-candidates.md)
- [ADR-0029](../architecture/decisions/0029-privacy-first-progress-photo-assistance.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0065](../architecture/decisions/0065-private-photo-inventory-read-authority.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
