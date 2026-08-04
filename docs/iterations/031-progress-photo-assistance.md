# Iteration 031 — Privacy-first progress-photo assistance

Date: 2026-08-04

State: implementation and local acceptance complete; production object custody, real-user research, policy review and hosted exact-SHA CI remain external/post-commit evidence rather than local claims

## 1. Scope and success standard

The product brief called for body/progress-photo assistance, but the repository previously implemented only food-photo proposals. This round closes that single product gap without expanding into posture diagnosis, exact body-fat estimation, medical imaging or an external vision provider. The bounded outcome is a private capture-consistency and same-view visual-comparison tool.

Success requires front/side/back user declaration; explicit per-capture analysis consent; separate consent for long-term retention; raw-image rejection and EXIF-stripping re-encoding; private purpose-scoped objects; 24-hour analysis-only expiry; four deterministic capture-quality checks visibly labeled as machine estimates; user-controlled onion-skin comparison; explicit deletion; independent analysis/retention withdrawal; privacy inventory/export/account-erasure coverage; shared API/OpenAPI contracts; responsive H5 evidence; tests, documentation, Obsidian mirror and one Conventional Commit.

This round does not use a real-person dataset, infer anatomical landmarks, rank bodies, persist raw uploads, call a billable model, provision cloud infrastructure or claim a public deployment. GitHub dataset/repository research was deliberately not added: the selected boundary is deterministic image-quality math and user-declared views, so an external body-image corpus would introduce license, consent, demographic bias and biometric-retention risk without being necessary for the feature.

## 2. Structure, technology and design state

New/changed boundaries:

- `packages/contracts/src/progress-photo*` owns consent, reservation, lifecycle, view, quality and response schemas; privacy export advances to `myfitness-portable-export-v2`.
- `infra/postgres/migrations/0020_progress_photos.sql` adds purpose consent values, purpose-scoped food keys and the constrained progress-photo lifecycle.
- `apps/api/src/progress-photos` owns signed reservation/upload/preview, deterministic quality checks, expiry, deletion and consent-withdrawal behavior.
- `PhotoStorageService` now writes `<user>/food/<photo>.jpg` or `<user>/progress/<photo>.jpg`; `DataOperationsService` validates scoped jobs and can finish progress-photo deletion disposition.
- privacy inventory/export/revocation and administrator evidence counts now include progress-photo data without exposing bytes or user content to operators.
- `apps/client/src/pages/progress-photos` adds the capture/contact-sheet UI, retention choices, consent controls, quality explanations, same-view overlay and delete confirmation; the body-record page links to it.
- committed OpenAPI, architecture/privacy/food-photo models, ADR-0029, design review, roadmap, risk register, README and project status describe the implemented boundary.
- `output/playwright/iteration-031-progress-photos-{mobile,wide}.png` retains reviewed visual evidence.

Technology stays inside the existing Taro 4/React/TypeScript client, NestJS/Zod/PostgreSQL API, Sharp sanitization, S3-compatible private object storage, Redis-backed operational perimeter, durable PostgreSQL deletion worker and Vitest/Playwright toolchain. No package dependency or external runtime service was added.

The visual direction is an **Alignment Contact Sheet / 对位联系表**. Paper/Mist surfaces and fine registration-grid lines make the page feel like a private measurement sheet. Mineral blue owns action and the overlay seam; Juniper marks selected retention and capture-ready checks; amber is limited to camera adjustments. Print-registration corners, a neutral user-declared capture silhouette and an adjustable onion-skin seam are the signature elements. The page contains no transformation score, body gauge, good/bad posture color, generic before/after marketing or chatbot motif.

## 3. Implementation method

### Minimize inference before adding a model

The user declares `front`, `side` or `back`. The server sanitizes the image first, then calculates only orientation ratio, output resolution, mean brightness and channel standard deviation. The strict result has four known reason-code unions and `machineEstimate: true`; `ready` means the capture conditions passed, not that the person is healthy or normal. An `adjust` result remains user-owned and can still be retained or compared.

This avoids a dataset and provider entirely. It also keeps the captured image out of confirmed health records and prevents a future model adapter from silently becoming the product authority.

### Make retention a separate owner decision

Every reservation creates a current analysis-consent event. `analysis_only` receives an automatic 24-hour deadline. `retained` requires a second current-version retention consent and has no implicit expiry. Withdrawing analysis deletes temporary/reserved media but preserves separately retained JPEGs after clearing machine results. Withdrawing retention purges every progress row and object. New consent events can be created after withdrawal without erasing the old acceptance interval.

Purpose-scoped object keys are the enforcement boundary: food withdrawal deletes only `food`, progress withdrawal deletes only `progress`, while account erasure intentionally removes the entire user directory. Legacy food keys remain valid for reads/deletes so applied history does not need rewriting.

### Keep comparison under direct user control

Only two retained photos with the currently selected declared view enter comparison. The client defaults to the latest pair but exposes “设为基准/设为当前”. The overlay changes current-image opacity and draws a visual seam/crosshairs; no server or client algorithm measures body change. Capture reminders and the comparison disclaimer explain that lighting, distance, clothing and time alter perception.

### Reuse durable custody rather than inventing a new deletion path

Raw multipart bytes remain in memory. Sharp rotates, bounds to 1600 px, re-encodes quality-82 JPEG and thereby removes EXIF before checksum/conditional private write. Exact-object and scoped-prefix deletion use the existing durable job/lease/retry/dead-letter machinery. Portable export embeds active sanitized media as base64 from a repeatable-read snapshot and excludes storage keys, fingerprints, idempotency keys and signatures.

## 4. Validation evidence

- Migration runner applied/verified all 20 checksum-protected migrations. API and client strict TypeScript passed during focused development; the committed OpenAPI document regenerated from the real application graph.
- Contract/quality focused validation passed 2 files / 6 tests, and the contract/privacy/client-model pass completed 3 files / 12 tests during development. The final repository suite passed 43 files / 175 tests, including schema drift for every progress lifecycle/view/retention/consent/method value.
- Progress-photo, privacy, food-photo and administrator integration suites passed 4 files / 18 tests. The final full integration suite passed 12 files / 50 tests. Evidence includes EXIF stripping, `progress` storage keys, signed preview, owner isolation, analysis-only expiry semantics, separate retention consent, analysis withdrawal preserving retained media, retention withdrawal purging it, privacy v2 export with base64 sanitized media and legacy food-photo compatibility.
- The production H5 and WeChat Mini Program builds completed. Taro retained the registered upstream dynamic-import, chunk-size and webpack cache warnings; no new compile error was introduced.
- A Playwright CLI real-browser pass at `127.0.0.1:4173` used two generated synthetic 800×1200 fixtures. It exercised two consent cycles, real file chooser/upload, four `ready` explanations, two-photo overlay, 1440×1000 and 390×844 layout, delete modal and deletion feedback. Both uploaded objects were removed through the UI after evidence capture.
- [Mobile evidence](../../output/playwright/iteration-031-progress-photos-mobile.png) shows the first-screen hierarchy, separate data-permission entry, capture direction and registration frame without horizontal overflow.
- [Wide evidence](../../output/playwright/iteration-031-progress-photos-wide.png) shows the onion-skin comparison controls and two-row private contact sheet with quality provenance and explicit actions.
- Local API readiness returned HTTP 200 with PostgreSQL, Redis and object storage up; the production H5 preview and development H5 both returned HTTP 200. No external AI/provider request or real-person image was used.

## 5. Problems found and experience captured

- Shared photo objects originally used an unscoped user prefix. Reusing a purpose-wide prefix deletion for progress photos would let food-consent withdrawal delete unrelated body media. New writes now have `food`/`progress` scopes, and job payloads carry an optional validated scope; whole-user erasure remains deliberately broader.
- The first API typecheck could not see progress constants because the new constants module was not exported from the package entry. Building the shared package after adding the explicit export fixed the actual cross-workspace boundary; direct-source contract tests alone would not have exposed this consumer failure.
- Taro watch mode hot-reloaded existing files but did not register a newly added page from `app.config.ts`. Only the H5 process was restarted; the database/API data was preserved. The API development process is also non-watch, so it required a targeted restart before the new controller became visible.
- The Taro development warning iframe covered screenshots even though compilation succeeded. Functional DOM inspection still passed, and visual evidence was taken from a clean production H5 build through an isolated Playwright CLI session.
- Retention withdrawal counted every purged progress record, including a prior analysis-withdrawal tombstone. The API copy therefore says “照片记录” rather than claiming the number is only active stored media; actual active-object custody is separately reported by privacy inventory.
- The wide evidence intentionally captures the scrolled comparison/contact-sheet state, while mobile captures the top capture register. Together they show the important responsive hierarchy better than two redundant hero screenshots.
- Synthetic checkerboards were sufficient to test deterministic brightness/contrast and visual overlay without collecting sensitive body images. Generated JPEG inputs remain ignored local QA material; only final PNG evidence is committed.

## 6. Global state review, remaining risks and next step

The initial local MVP now has body/recovery, workout and meal recording; Today/trends; deterministic weekly planning; review-only fixture AI explanations; food-photo proposals; privacy ownership/export/erasure; and progress-photo capture/comparison. Progress photos remain a high-sensitivity feature: simple quality checks do not control all perception differences, retained media expands export/custody volume, and local MinIO is not production encryption/IAM/lifecycle/replication proof.

Iteration 32 is the managed shared deployment/beta gate. It needs owner-operated account/budget, domain/TLS, real WeChat/OIDC, named data/incident owners, centralized telemetry, privacy/AI filing decisions, managed database/object controls and—only if approved—a paid-provider canary. Those inputs stay mandatory but are not fabricated locally. Until they arrive, bounded local hardening candidates are bundle budgets/chunk splitting, 320 px/system-large-text/full keyboard-screen-reader review, proactive stale-plan refresh and server-authoritative workout completion.

## 7. References

- [Iteration 030 archive](030-obsidian-status-mirror.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Progress-photo model](../architecture/PROGRESS_PHOTO_MODEL.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0029](../architecture/decisions/0029-privacy-first-progress-photo-assistance.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
