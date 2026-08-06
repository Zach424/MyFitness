# Iteration 088: Portable-export lifecycle authority

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round binds the final portable-export file side effect to current privacy-page authority. Acceptance requires unmount or accepted-custody loss to prevent late validated artifacts from downloading, persisting or publishing success; H5 Blob URLs must be revoked; an invalidated operation must not change the account-erasure export choice; and only a later explicit action may start fresh.

The round changes one pure client predicate, the privacy page, the existing lazy download adapter, browser evidence and the smallest required WeApp total budget. It adds no API, contract, migration, persistent request, background retry, health interpretation, cloud service or external provider.

## 2. Structure, technology and design state

- `privacy.model.ts` owns the pure generation/mounted/current-custody commit predicate, with direct unit coverage.
- `privacy/index.tsx` retains the active export generation, in-flight flag, mount state and current custody authority in React refs. Unmount, overview refresh, revocation recovery, erasure start and logout invalidate the operation synchronously.
- `privacy-export-download.ts` accepts a `canCommit` callback and checks it around token acquisition, temporary response/read, deterministic verification and platform save/download boundaries.
- H5 stale artifacts revoke their Blob URL without an anchor click. WeApp checks before save and attempts `removeSavedFile` if a saved path appears after authority ends.
- `privacy.spec.ts` adds one 390 × 844 real API race spanning navigation, revocation-response recovery, current-overview reconciliation and fresh explicit downloads.
- `nutrition.spec.ts` scopes one pre-existing recovery assertion to `.nutrition-feedback` because a local-draft notice is also legitimately `role=status`; product semantics are unchanged.

## 3. Implementation method

### Carry authority into the side-effect owner

Checking only after `downloadPrivacyExport()` returns is too late because that function owns the anchor click or persistent save. The page now passes a closure that combines captured request generation with live generation, mount state and custody authority. The adapter asks the closure before every transition that could retain or expose the sensitive artifact.

### Invalidate synchronously at custody boundaries

Starting a current-overview refresh advances the export generation before loading state renders. Revocation-response recovery, erasure initiation and logout do the same; component cleanup covers navigation/unmount. The page clears its busy control immediately, but stale `catch`/`finally` paths cannot publish an error, downloaded choice, success receipt or newer busy state.

### Release platform artifacts conservatively

An H5 Blob URL is released whenever authority is absent after response, read or verification, as well as through the existing invalid/failure/success paths. WeApp cannot make `saveFile` and page authority one atomic transaction, so it checks immediately before, then checks again after save and best-effort removes the returned saved path if authority ended. Failure of that removal is not presented as proven deletion and remains part of real-device custody validation.

### Exercise delivered and cancelled races

The browser first holds a complete export response, navigates away, releases it and observes zero downloads. After returning, a fresh action downloads successfully. A second held export overlaps a deliberately lost AI-consent revocation response; the custody desk enters recovery and H5 cancels that pending transfer, leaving the download count unchanged and no lifecycle error visible. Current-overview reconciliation confirms the consent remained active; one final explicit export succeeds.

## 4. Validation evidence

- The new predicate first failed as expected, then the privacy model and export verifier passed together 2 files / 11 tests. All three real export browser scenarios passed 3/3; the lifecycle race passed repeatedly 1/1.
- Repository-wide unit validation passed 80 files / 409 tests; strict workspace TypeScript, repository formatting and zero-diff checks passed.
- The first full browser run reached 90/94 and exposed three unrelated timing failures plus one ambiguous nutrition status locator. The privacy/focus cases passed targeted; the status ambiguity reproduced and was scoped to `.nutrition-feedback`. A second run reached 93/94 with one different one-shot history-focus miss that passed targeted. The final complete main suite passed 94/94 in 6.4 minutes. These misses remain iteration-089 input rather than hidden evidence.
- The correctly sequenced OIDC build/suite passed 3/3, retaining 97 total browser tests. Normal H5, OIDC H5 and WeApp production builds passed.
- API/administrator, PostgreSQL integration and AI suites were not rerun because the product change is client-only; their iteration-085 evidence remains unchanged at 63 integration tests.
- `pnpm client:verify` passed: H5 total 2,804,141 bytes, entry 319,238 and largest async JavaScript 205,178; WeApp total 1,067,717, vendor 19,338 and largest page 55,697. Forbidden runtime-marker scans are empty. Only the WeApp total ceiling was narrowly rebased from 1,067,000 to 1,070,000 bytes.
- Production dependency audit reports zero critical/high and nine registered moderate Taro build-chain findings.
- Obsidian status and this knowledge archive are written and verified byte-for-byte before commit.
- Inspected evidence: `iteration-088-export-lifecycle-mobile.png`.

## 5. Problems found and experience captured

- Lifecycle authority must reach the function that owns the irreversible browser/platform side effect. A page-only post-return guard cannot undo an anchor click or save that already occurred.
- Authority checks belong on both sides of asynchronous local work. Token acquisition, the platform download, Blob/file read and WeApp save can each outlive the page generation independently.
- An invalidated operation should be silent and leave the prior export choice unchanged. A cancellation toast or automatic restart would falsely turn obsolete work into a current result.
- H5 navigation allowed the held response to settle and proved adapter rejection; custody recovery caused H5 to cancel the pending routed request before fulfillment. Both are valid transport outcomes, and both must leave zero new downloads.
- WeApp rollback is deliberately best effort. `removeSavedFile` failure cannot be reported as physical deletion without real-device evidence and an independent custody mechanism.
- Broad validation is evidence discovery, not ceremony. It found an ambiguous strict locator and intermittent one-shot deferred-focus misses that targeted feature tests did not reveal.
- A test should scope status assertions to the intended live region once multiple semantically valid status surfaces coexist. Tightening the locator preserved stronger accessibility semantics rather than removing either role.
- `pnpm test` is the repository unit command; an attempted `pnpm test:unit` failed because no such script exists and was immediately corrected. Exact command names belong in reproducible evidence.

## 6. Global state review, remaining risks and next step

Portable export now has server snapshot/no-store semantics, local media/schema/size verification and client lifecycle authority through the final file side effect. H5 behavior is proven under navigation and custody-recovery races. WeApp compiles with pre/post-save checks, but temporary-file handling, post-save removal failure and physical storage behavior still require a real device before release.

Iteration 089 should harden deferred H5 focus acquisition exposed by the broad runs. A target that mounts after the first timer should receive a small bounded retry without polling indefinitely; user focus movement, page/authority invalidation and stale dialog generations must cancel the attempt. Aggregate-history, delete-recovery and existing fallback behavior must remain explicit and reproducible.

Managed deployment and real identity/provider/object-storage/custody/telemetry/policy inputs remain parked until the user supplies them.

This archive is also the iteration-088 knowledge note mirrored into Obsidian; `docs/PROJECT_STATUS.md` remains the authoritative global state.

## 7. References

- [Iteration 087 archive](087-consent-history-request-lifecycle.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0011](../architecture/decisions/0011-user-owned-export-and-erasure.md)
- [ADR-0059](../architecture/decisions/0059-privacy-custody-read-authority.md)
- [ADR-0078](../architecture/decisions/0078-portable-export-client-artifact-validation.md)
- [ADR-0083](../architecture/decisions/0083-portable-export-lifecycle-authority.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../architecture/ARCHITECTURE.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
