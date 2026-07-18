# Iteration 011 — User privacy ownership

Date: 2026-07-19

State: complete locally for inventory, portable export, optional-consent withdrawal and primary-store account erasure

## 1. Scope

Deliver only the authenticated user's privacy ownership path: inspect a stable data inventory, download a machine-readable copy, withdraw optional AI/photo processing and permanently erase the implemented primary database/private-media boundary. Required service consent, administrator RBAC, backup/provider deletion, incident operations and legal review stay explicitly outside this round. Acceptance requires deliberate deletion confirmation, no secret leakage in export, user-scoped media cleanup, session invalidation, H5/WeApp design, end-to-end evidence, global archive updates and one local commit.

## 2. Structure, technology and implementation

- `packages/contracts`: added strict inventory, consent state/revocation, portable-export and exact account-erasure contracts. Fixed versions are `myfitness-portable-export-v1` and `primary-store-v1`.
- `infra/postgres/migrations`: `0010` removes the consent purpose/version uniqueness so accept–revoke–accept cycles remain visible and permits user-scoped photo keys; `0011` adds an unlinkable erasure receipt containing only random receipt UUID, scope and completion time.
- `apps/api/privacy`: added owner-derived inventory counts, repeatable-read export assembly, optional consent withdrawal and deletion orchestration. The JSON includes normalized aggregates, immutable histories, AI provenance and retained sanitized photo bytes, while excluding tokens, hashes, idempotency keys and storage keys.
- `apps/api/ai`, `onboarding` and `nutrition`: consent acceptance now uses append-oriented intervals. AI/photo idempotency uses transaction advisory locks so a replay cannot manufacture another consent event. Food photos now live under `<user UUID>/<photo UUID>.jpg`; account purge removes exact legacy keys and the verified user directory.
- `apps/client/pages/privacy`: added the **Custody Ledger / 保管链台账** across H5/WeApp with inventory, authenticated download, authorization receipts, inline withdrawal confirmation, export-or-skip choice, permanent acknowledgement, exact typed phrase and a no-auto-recreate completion state. “我的” now opens ownership controls, while the profile mark remains available on both mobile and wide layouts for editing personal data.
- `tests/e2e` and API integration: added export/download, secret exclusion, media base64, withdrawal/regrant, database cascade, private-directory absence, receipt scope and session invalidation coverage.

Account deletion first locks and marks the active user `deletion_pending`, which stops new authentication. It then clears photo rows/files and the entire validated user directory. Finally, deleting the user graph and creating the unlinkable receipt happen in one PostgreSQL transaction. If media or database completion fails, the account returns to active instead of reporting a false success. The receipt says only what was exercised—`primary-store-v1`—and does not claim backup, log or external-provider deletion.

## 3. Design archive

The page extends the product's quiet logbook with a faint red ledger margin, numbered ownership rows and a custody chain `ACCOUNT → DATA → CONSENT → EXIT`. Mineral blue owns export, juniper marks active control, amber marks withdrawn optional processing and brick red appears only below a perforated `PERMANENT EXIT` line. Mobile reads the workflow in risk order; wide H5 keeps the data ledger visible beside the action column.

Reviewed evidence:

- [390 × 844 mobile custody ledger](../../output/playwright/iteration-011-privacy-mobile.png)
- [1440 × 1000 wide ledger/action split](../../output/playwright/iteration-011-privacy-wide.png)

## 4. Validation evidence

- `pnpm test`: 25 files / 81 tests passed.
- `pnpm test:integration`: 8 files / 25 PostgreSQL tests passed. New scenarios cover inventory, complete export/history/media, secret exclusion, optional withdrawal/regrant, exact deletion confirmation, cascade, user-directory absence, unlinkable receipt and invalidated session.
- `pnpm test:ai`: 7 FastAPI/provider tests passed. Existing plan and food-photo evals remain 7/7 and 8/8; no real or billable OpenAI request was made.
- `pnpm test:e2e`: 19/19 Chromium scenarios passed. New mobile download and wide withdrawal/erasure flows report no captured browser or page errors.
- Full workspace typecheck, OpenAPI generation, API build, H5 build and WeApp build passed. H5 entry remains 305 KiB and the largest warned chunk is 589 KiB; WeApp vendor remains 417 KiB and still warns that no async chunks are present.
- Migrations applied/verified 11 checksums. PostgreSQL and fixture AI are healthy; exact post-run database/private-storage cleanup is checked before commit.

## 5. Problems found and experience captured

- A unique `(user, purpose, version)` consent row can record withdrawal but cannot truthfully record a new grant. Removing uniqueness is insufficient by itself: idempotent request replay would create duplicate receipts, so the business reservation must lock/check idempotency before inserting acceptance.
- Flat private-media keys make account-wide deletion dependent on a perfect database/file transition. A validated user directory gives erasure a safe final sweep while exact legacy-key removal preserves compatibility.
- A deletion response is weak evidence if its receipt disappears with the user. The solution is an unlinkable completion row, written in the same transaction as user deletion, with a scope name that does not overclaim unimplemented backup/provider behavior.
- A portable export needs both a consistent snapshot and an explicit exclusion list. Returning every table column would leak request fingerprints, idempotency keys and storage paths even though no raw access token is stored.
- Soft-deleted current rows and immutable histories are both user data. Export tests must assert histories—not just visible current lists—and active sanitized media must remain portable while it is retained.
- Taro H5's custom input was not exposed to Playwright through the expected textbox role, while the same visible label correctly appeared in inventory and consent sections. Stable tests use region-scoped text assertions and the user-visible input placeholder rather than weakening strict mode.
- Visual review caught an orphaned final title character on wide H5 that functional tests could not detect. The headline width was adjusted without changing the mobile reading order.
- Moving “我的” from onboarding to privacy exposed that the wide layout had hidden its only remaining profile editor. The desktop profile mark is now visible beside the wordmark and outside the fixed navigation hit area; navigation ownership must be checked across every breakpoint when a destination changes.
- Taro's H5 and WeApp builds write to the same `apps/client/dist` directory. Target builds must be serialized, the H5 build must run last, and browser tests must not overlap either build, or the served assets can change target mid-suite.

## 6. Remaining risks and next step

The synchronous base64 JSON export can exceed API memory or the Mini Program's 50 MiB download boundary for a large account. Production identity/linking, encrypted object delivery, backup/log/provider deletion, durable jobs, reconciliation, rate limits, correlation/metrics, administrator access and incident rollback are still absent. System large text, full keyboard traversal and real WeChat screen-reader testing also remain open.

Iteration 012: implement administration and operations as one controlled boundary—request correlation and abuse limits first, then RBAC/audit/support, durable reconciliation, retention/backup/provider evidence and incident rollback—before creating a shared test deployment.
