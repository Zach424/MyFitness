# Iteration 057: Progress-photo authority-aware recovery

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round applies the accepted authority-aware workbench contract to progress-photo reservation, upload/quality checking and deletion. Acceptance requires reservation retry to preserve one unchanged in-memory request while reopening the chooser; upload/delete to reconcile current owner state before any repeat; selected media/path to remain unpersisted; non-media view/retention/consent intent to remain visible; unavailable controls to block pointer and keyboard replay; and real API response-loss proof for all three stages without overstated custody claims.

The round adds no body/pose inference, dataset, external model, biometric score, background media sync, offline queue, API, migration, provider, cloud service, credential, diagnosis, target or prescription.

## 2. Structure, technology and design state

- `lib/workbench-recovery.ts` expands from ten to thirteen classified operations with `progress_reserve`, `progress_upload` and `progress_delete`; retained input adds the explicit `capture_intent` class.
- The Taro contact sheet retains one request key and exact captured-at/view/retention/consent payload only in refs. The user must choose the local image again; file names, paths, bytes and replay commands never enter state storage.
- Reservation uses the existing owner/key/request-fingerprint server guard. Upload and deletion use the owner-visible ready list as their read-side boundary and are never automatically replayed.
- Upload reconciliation accepts only the exact reserved photo ID. Delete absence removes the item from the current contact sheet but says durable object cleanup continues.
- The former automatic delete after any upload exception is removed because upload may have committed before its response disappeared.
- Critical controls use shared pointer/Enter/Space guards with explicit `aria-disabled`. Three reviewed 390 × 844 artifacts use the established amber authority strip and existing delete dialog.

## 3. Implementation method

### Derive authority from the server lifecycle

The service audit found owner/key/fingerprint idempotency only at reservation. Upload sanitizes and writes a private object before atomically transitioning `reserved → ready`; a second upload is refused and cannot safely replay the media. Delete first changes the row to `deleted`, clears visible media metadata and enqueues durable object removal. The matrix therefore classifies reservation as same-request retry and upload/delete as reconcile-first.

### Preserve capture intent, never media

The first file selection creates one exact reservation payload and key. If the response is lost, the form remains on the selected view, retention mode and consent decisions, but the recovery action reopens the platform chooser. Browser proof scans local application storage and finds neither the selected file name nor a data URL. A terminal attempt clears only in-memory request metadata.

### Reconcile upload instead of deleting uncertainty

The previous catch block called delete for any error after reservation. That was unsafe because object storage, capture-quality analysis and the ready transition may have completed while only the response was lost. The new path retains the reservation ID, reads the ready list and accepts only an exact ID match. An absent ID becomes a terminal no-reviewable-photo state; the page does not resend bytes and existing reservation/analysis-only expiry performs bounded cleanup.

### Reconcile deletion with a narrow custody claim

An ambiguous delete disables both dialog choices and offers only a list read. If the item is absent, the page says it left the current private contact sheet and that durable object cleanup continues. If still visible, it ends the attempt without automatic replay. Even a normal 204 response uses the same list-removal/durable-cleanup language because the service intentionally logs and retains a failed deletion job rather than failing the logical removal response.

### Inject response loss after real storage work

Playwright sends reservation/upload/delete to the real API, PostgreSQL and local private object storage, asserts the committed 201/204 response and aborts only the browser-facing response. Reservation retry proves two attempts share one non-empty key and produce one ready item. Upload reconciliation finds the committed ready ID without a second upload. Delete reconciliation sees list absence while refusing to claim physical deletion.

### Rebaseline only measured lazy growth

The progress-photo route becomes the largest H5 async artifact and WeApp page. Budgets move narrowly to H5 total/async 2,457,500/198,500 bytes and WeApp total/page 857,000/43,500 bytes. H5 entry and WeApp vendor ceilings remain fixed at 320,000/25,000.

## 4. Validation evidence

- Focused recovery-contract validation passed 27 tests, including all thirteen classified operations and capture-intent retention.
- Repository-wide unit validation passed 65 files / 316 tests.
- Strict workspace TypeScript and repository formatting passed.
- Two focused real-service browser scenarios passed: ambiguous reservation plus deletion, and ambiguous upload plus normal cleanup.
- The complete main H5 browser suite passed 49/49 tests in 2.8 minutes. Together with the unchanged dedicated OIDC suite, the repository now retains 52 browser tests.
- H5 and WeApp production builds passed. Known non-blocking Taro cache/entry-size warnings remain registered.
- `pnpm client:verify` passed: H5 total 2,456,895 bytes, entry 318,996 and largest async JavaScript 198,207; WeApp total 856,228, vendor 18,915 and largest page 42,976 (`pages/progress-photos`). Forbidden runtime-marker scans are empty.
- Production dependency audit exited successfully with zero critical/high and nine registered moderate Taro build-chain findings.
- Inspected evidence: `iteration-057-progress-reserve-recovery-mobile.png`, `iteration-057-progress-upload-reconciliation-mobile.png` and `iteration-057-progress-delete-reconciliation-mobile.png`.

The integration, dedicated OIDC and AI/evaluation suites were not rerun because API, database, identity, prompt, validator and worker code did not change. Browser tests exercised the unchanged progress-photo API, PostgreSQL lifecycle and local private object storage directly.

## 5. Problems found and experience captured

- An upload exception is not permission to delete. The media and ready transition may exist even when the browser never receives the response; automatic cleanup can destroy a successful user-owned capture.
- Reservation idempotency covers the exact captured-at payload as well as view/retention/consent. Retry must retain that timestamp and key while requiring a fresh local selection; generating a new timestamp with the old key would correctly conflict.
- The ready list can prove an exact upload committed, but absence does not expose the reserved row. The safe terminal outcome is no visible photo and lifecycle cleanup, not a guessed retry or success.
- Logical list removal and physical object deletion are different custody facts. The API's durable job design intentionally permits pending cleanup, so both normal and recovered client copy must preserve that distinction.
- Consent and retention choices are safe page-owned recovery input; file names, paths, bytes and replay commands are not. Naming this `capture_intent` made the policy boundary testable.
- Taro again exposed a semantic/visual difference: the consent toggle kept an accessible name but its disabled label was visually blank. Explicit token color plus screenshot review corrected it.
- Full E2E refreshed historical screenshots. All tracked test-generated changes were restored; only the three new iteration-057 artifacts remain.

## 6. Global state review, remaining risks and next step

Both private-photo workflows now forbid background media replay and use read-side evidence before reporting an ambiguous upload/confirmation/deletion. The tests prove local API/database/object-store behavior after simulated browser response loss; they do not prove real radio transitions, WeChat device accessibility, production KMS/IAM/lifecycle or completed physical deletion.

Iteration 058 should audit weekly-plan accept/modify/skip/regenerate operations. Each decision must follow actual revision/idempotency authority, preserve only page-owned input, avoid blind replay after response loss and reconcile the exact current plan revision/action before reporting success. Managed deployment and real-provider/custody/telemetry/policy inputs remain parked until the user supplies them.

## 7. References

- [Iteration 056 archive](056-owner-food-definition-recovery.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Progress-photo model](../architecture/PROGRESS_PHOTO_MODEL.md)
- [ADR-0029](../architecture/decisions/0029-privacy-first-progress-photo-assistance.md)
- [ADR-0052](../architecture/decisions/0052-authority-aware-sensitive-workbench-recovery.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
