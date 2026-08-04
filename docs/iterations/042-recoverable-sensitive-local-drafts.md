# Iteration 042 — Recoverable sensitive local drafts

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Workout, meal and health-record input previously existed only in component memory. A refresh or short client failure discarded unfinished work. Iteration 042 adds one bounded local recovery contract to the three create editors.

Success requires version and kind checks; a 24-hour expiry; a 96 KiB serialized cap; verified-user scoping with development-subject fallback; structural validation before write/restore; visible saved-at/expiry and explicit restore/discard; and clearing after save, cancel, logout and account-erasure initiation. Raw photos/paths, authentication material, erasure receipts and unconfirmed AI proposal state must remain outside the contract.

This round does not add server-side drafts, background sync, correction-draft recovery, encryption claims, cloud services or a new runtime dependency.

## 2. Structure, technology and design state

- `apps/client/src/lib/draft-vault.ts` owns the dependency-free envelope, bounds, owner comparison, expiry and purge behavior. `local-drafts.ts` adapts it to Taro application storage.
- `local-storage-keys.ts` gives authentication, user identity, development subject and erasure receipt stable non-overlapping names. Verified dev/WeChat/OIDC session responses now persist the server user UUID for draft scope.
- Each record model owns its exact structural guard. Incomplete numeric strings are recoverable, while unknown keys, metrics/units, oversized collections and non-finite values are rejected.
- `use-local-draft.ts` handles the 600 ms quiet-period save and explicit pending/saved state. `LocalDraftNotice` renders the shared LOCAL / 24H ticket on H5 and WeApp.
- The privacy page adds an explicit device logout. Logout and erasure-intent preparation clear all draft kinds without deleting the separately governed erasure receipt.
- ADR-0040, architecture, privacy ownership, design system, roadmap, README and global status describe the same ephemeral-copy boundary.

Technology remains TypeScript strict mode, Taro 4/React, Vitest and Playwright. No API endpoint, database migration, provider, data source or package dependency was added.

## 3. Implementation method

### Make the recovery copy self-invalidating

Every key holds one `myfitness-sensitive-draft/v1` envelope with exact contract/version/kind, owner scope, ISO save/expiry instants and payload. Reads reject and remove malformed JSON, values above 96 KiB, wrong owner/kind/version, invalid timestamps, invalid payloads, future save times and envelopes whose expiry is not exactly 24 hours after save. Without a verified user UUID or development subject, writes and restores are disabled. A rejected replacement write also removes the prior value so the interface cannot advertise or later restore a stale draft.

### Whitelist incomplete form state, not page state

The workout guard bounds 30 exercises × 50 sets and explicit category/tracking/equipment literals. The meal guard bounds 50 food snapshots, serving fields and non-negative nutrient/reference facts. The health guard accepts only the nine metric definitions and a compatible unit. Partial text such as an empty numeric input is valid because recovery must work before business validation; save still runs the existing full request validator.

Only these shapes serialize. Photo file paths/bytes, photo review candidates, consent switches, API tokens/codes, idempotency keys, erasure intent/receipt secrets, loading/errors and modal state have no allowed field. Explicitly confirmed photo items become ordinary catalog-bound meal snapshots, while the candidate sheet is not retained.

### Require the user to choose restoration

Meaningful create-form changes save after 600 ms. A refresh shows a paper ticket with its saved and automatic-clear times but leaves the default form intact. Restore and discard are separate buttons. Saved-state copy names the exclusions; it does not call application storage encrypted or secure.

Save/update, cancel/discard, logout and erasure-intent preparation call the same clear boundary. A 401 retry removes only the expired access token, preserving same-owner draft recovery through transparent session renewal.

### Measure and remove cross-route bundle leakage

The first implementation placed all three guards in one shared runtime module. The meal route then included `body.weight` and `reps_load`, reaching 205,054 bytes and breaching the unchanged 200 KB async ceiling. Moving each guard into its owning model reduced the final largest route to 198,467 bytes. Only reviewed total-tree ceilings move to 2.28 MB H5 and 770 KB WeApp.

## 4. Validation evidence

- Focused client validation passed 5 files / 18 tests. The six new cases prove envelope metadata, expiry, owner mismatch, malformed/oversized/version rejection, unscoped refusal, clear-all and exact field exclusions.
- Repository-wide unit validation passed 54 files / 237 tests.
- PostgreSQL integration validation passed 17 files / 59 tests; no database behavior changed.
- Strict TypeScript passed across all six product/shared workspaces; formatting passed.
- Main H5 browser validation passed 33/33 and dedicated OIDC passed 3/3, for 36 browser cases. New flows prove health restore/save clearing, workout restore/discard, meal restore/save, logout clear-all and erasure clear-all with no page/console/request errors.
- H5 and WeApp production builds passed. Client quality measured H5 `2,264,623` total bytes, `313,346` entry bytes and `198,467` largest async JavaScript; WeApp `756,281` total bytes, `18,915` vendor bytes and `41,690` largest page JavaScript. Forbidden validation-runtime markers remain absent.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-042-recoverable-draft-mobile.png`.

## 5. Problems found and experience captured

- A shared source file is not necessarily a shared emitted chunk. Importing three guards through one client module polluted the largest lazy route; route ownership must be verified in production bytes.
- Draft schema validity and save validity are different. Rejecting empty numeric strings would make recovery fail precisely while the user is mid-entry.
- User scope belongs inside the envelope even with fixed non-identifying keys. Logout clearing is defense in depth; owner comparison prevents restoration if clearing is bypassed.
- Automatic restore is data loss in another direction: it can overwrite current input or expose prior work on a shared device. The recovery decision must stay explicit.
- An erasure receipt secret and an editor draft have opposite retention purposes. Clear drafts at erasure initiation, but keep receipt recovery storage separate until the user removes it or it expires.
- Application-local does not mean encrypted. Copy and documentation must describe duration and removal, not imply a secure enclave.

## 6. Global state review, remaining risks and next step

The three primary create flows now tolerate refresh/crash without introducing durable server state. Correction forms still rely on the saved server aggregate and do not recover unsaved edits. H5/Mini Program application-storage encryption, shared-device behavior and OS backup semantics remain unverified production concerns.

The next locally verifiable recording gap is explicit occurrence-time control. Iteration 043 should let users backfill and correct when a body/recovery record, meal or workout actually occurred, convert local input with an explicit timezone/DST boundary and keep future/invalid timestamps out. Managed deployment remains parked pending owner inputs.

## 7. References

- [Iteration 041 archive](041-health-metric-observation.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0022](../architecture/decisions/0022-recoverable-account-erasure-intent.md)
- [ADR-0028](../architecture/decisions/0028-h5-oidc-browser-transaction-and-candidate.md)
- [ADR-0040](../architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
