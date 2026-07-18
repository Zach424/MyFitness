# Iteration 010 — Revocable food-photo candidates

Date: 2026-07-19

State: complete locally with fixture worker, private media lifecycle, cross-end review UI and tests

## 1. Scope

Deliver only “food photo → revocable candidates → user selects/edits portions → carry into the current unsaved meal draft”. AI must not create a meal, invent nutrient values, diagnose, identify people or turn a portion estimate into a fact. Success also requires per-request consent, signed private upload/preview, EXIF removal, 24-hour expiry, immediate deletion paths, deterministic validation, fixture/OpenAI adapters, multi-end design, offline evaluation, global archive updates and one local commit.

## 2. Structure, technology and implementation

- `packages/contracts`: added consent/status/media/candidate/worker/confirmation schemas and fixed prompt/validator constants.
- `packages/domain`: added catalog/label/portion/safety validation and confirmation-range enforcement.
- `infra/postgres/migrations`: added consent purpose and `nutrition_photo_candidates` lifecycle/provenance table in `0008`; added immutable follow-up `0009` for the storage-key regex repair.
- `apps/api`: added Sharp 0.35.3 sanitization, exact-path private disk adapter, HMAC upload/preview links, reservation/processing/review/confirm/delete/expiry orchestration and OpenAPI routes. Explicit-origin credentialed CORS supports Taro multipart upload.
- `services/ai`: added authenticated food-photo endpoint, no-cost fixture and OpenAI Responses vision path with strict schema, `store:false`, low reasoning and explicit `detail:"high"`.
- `apps/client`: added the **Photo Proof / 食物校样条** in the nutrition editor. Consent, source, `未确认 / PROOF`, confidence words, ranges, editable grams, manual completion, deletion and “still unsaved” copy are explicit on H5/WeApp.
- `services/ai/evals` and `scripts`: added eight valid/adversarial catalog cases and a reproducible iteration-010 report.

The raw upload is held only in memory. The API verifies MIME against decoded bytes, rejects animation/oversize images, auto-rotates, resizes inside 1600×1600, re-encodes JPEG without metadata and writes a UUID-only private file. The worker sees that sanitized JPEG plus catalog keys/labels/categories—no identity, raw records, notes or nutrients. Model failure has no visual fallback. Confirmation validates selected grams, clears content/hash/media, retains minimal selection/provenance and returns known catalog drafts; `nutrition_meals` remains untouched until the ordinary Save Meal action.

## 3. Design archive

The nutrition page keeps its quiet preparation-grid/logbook language. The one expressive risk is a diagonal amber `未确认 / PROOF` stamp over the private preview. Numbered candidate slips use left rules, confidence words and printed portion bands rather than sparkle/chatbot imagery. Mobile reads photo then candidates; wide H5 places proof and candidates side by side. Fixture copy says it is not real recognition.

Reviewed evidence:

- [390 × 844 mobile candidate proof](../../output/playwright/iteration-010-food-photo-mobile.png)
- [1440 × 1000 wide proof/candidate split](../../output/playwright/iteration-010-food-photo-wide.png)

## 4. Validation evidence

- `pnpm test`: 23 files / 74 tests passed.
- `pnpm test:integration`: 7 files / 22 PostgreSQL tests passed, including EXIF removal, 1600 px bound, signed preview, cross-owner denial, CORS preflight, invalid bytes, confirmation/no-meal, explicit deletion and retention expiry clearing.
- `pnpm test:ai`: 7 FastAPI/provider tests passed; mock transport verifies strict non-stored high-detail image input without a paid request.
- `pnpm eval:ai`: existing plan set passed 7/7. `pnpm eval:food-photo`: new catalog/safety set passed 8/8 and wrote [the report](../../output/evals/iteration-010-food-photo-evaluation.json).
- `pnpm test:e2e`: 17/17 Chromium scenarios passed, including photo consent/upload/review/confirm-to-unsaved-draft and wide revoke; captured browser errors were empty.
- Full workspace typecheck, OpenAPI generation, API build, H5 build and WeApp build passed. H5 entry is 305 KiB and the known largest chunk is 581 KiB; WeApp warns on the 417 KiB vendor bundle and missing async splitting.
- Migrations applied/verified 9 checksums. PostgreSQL and fixture AI worker are healthy. Post-run database/photo-storage cleanup is checked before commit.
- No real/billable OpenAI request was made.

## 5. Problems found and experience captured

- PostgreSQL standard-string regex escaping made a valid UUID `.jpg` key fail after the migration was applied. The fix is additive migration `0009`, not a checksum-breaking edit. Files are now also removed when the database transition itself throws.
- Metadata probing can succeed while later pixel decoding fails. The complete Sharp pipeline now maps that condition to a bounded `400`, not an internal error.
- Taro custom buttons need explicit `aria-disabled`; a rendered `disabled` attribute alone is not reliably reflected in the H5 accessibility tree.
- Taro H5 `uploadFile` uses credentialed XHR. Explicit-origin CORS must return `Access-Control-Allow-Credentials:true`; direct supertest uploads alone did not expose this.
- A structurally readable PNG can still contain corrupt pixel data, so E2E fixtures must be fully decoded before use.
- Image privacy is a state-machine property: raw bytes never land, and confirmation/deletion/failure/expiry tests must assert both database clearing and filesystem absence.
- The OpenAI documentation MCP registration succeeded but was not visible until a process restart, and the exact model-resolver URLs returned an internal error. This round therefore reviewed the bundled complete migration/prompt fallback guides plus the official models, vision, Structured Outputs and data-control pages; this fallback is recorded so provider research is reproducible.

## 6. Remaining risks and next step

Real-provider image quality, latency, cost, content filtering and data controls are untested; `store:false` is not a zero-retention contract. Local disk is not production object storage. The demo food catalog is not release data. Consent still lacks user-facing revocation/export, production identity/rate limits/observability are absent, and large-text/real-device screen-reader review remains open.

Iteration 011: implement privacy and operations—the user data inventory/export/deletion workflow first, then consent revocation, admin RBAC/audit/support boundaries and retention/incident runbooks. Production model and shared deployment remain gated.
