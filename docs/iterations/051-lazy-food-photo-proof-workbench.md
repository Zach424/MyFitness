# Iteration 051: Lazy food-photo proof workbench

Date: 2026-08-05

Status: complete

## 1. Scope and acceptance

This round removes optional food-photo consent, upload, proposal and review state from the manual nutrition page and moves it to an explicit lazy private-custody workbench.

Success requires opening nutrition to perform no candidate request; photos, consent and unconfirmed candidates to remain outside the 24-hour meal-draft vault; only an explicitly server-confirmed catalog key/gram selection to return to the still-open meal draft; the draft's existing title/items to survive navigation; confirmation, deletion, failure, expiry and privacy revocation authority to remain unchanged; and the measured largest WeApp page to fall below the prior 45,512 bytes.

This round adds no API, migration, provider, cloud service, real credential, dataset import, nutrition target, food-quality judgment, diagnosis or treatment claim.

## 2. Structure, technology and design state

- `pages/nutrition` now owns meal facts, the food picker and one compact `PHOTO PROOF / 按需打开` launcher. It no longer imports photo media components or photo lifecycle API functions and no longer lists candidates during normal page initialization.
- `pages/food-photo-workflow` owns an isolated candidate-selection model plus consent, upload, recovery, review, confirmation and deletion UI.
- The existing registered `pages/progress-photos` route dispatches to the food workbench for `kind=food`. This keeps sensitive photo tools together and avoids another H5/WeApp route runtime without mixing their state or APIs.
- Taro `EventChannel` is the confirmed-only return path. The parent registers one listener; the child refuses confirmation without an opener, confirms through the API, emits only confirmed catalog keys/integer grams and navigates back.
- The proof workbench uses a private-custody header, three-step retention rail and off-axis `未确认 / PROOF` stamp. The single visual risk is confined to the proof stamp; surrounding controls stay quiet and evidence-led. Explicit token colors keep destructive and primary button labels visible under Taro H5.
- The existing API, Zod contracts, PostgreSQL state, MinIO fixture boundary, durable deletion queue and privacy withdrawal flow are unchanged.

Technology remains TypeScript strict mode, Taro 4/React, NestJS, PostgreSQL 18, the existing fixture AI worker, Vitest and Playwright. No runtime dependency was added.

## 3. Implementation method

### Preserve the draft without persisting the proposal

`navigateTo` retains the nutrition page instance in the Taro stack. Its title, occurrence, existing food items and correction identity stay owned by that page. The child never receives the draft. While the workbench is open, the existing vault may save the parent meal fields, but browser proof reads the envelope and verifies that unconfirmed catalog candidates and preview data are absent.

### Return only an authoritative confirmation

The workbench builds a bounded confirmation from candidates actually displayed on the current ready analysis. It rejects empty/duplicate selection, unknown keys, non-integer grams and values outside displayed ranges before calling the API. Only the API's successful confirmation response is emitted. The nutrition listener then maps those keys through the controlled starter catalog into independent gram-based food drafts. No URL, local storage or global singleton transports the result.

### Fail closed on a missing opener

A direct visit has no safe destination for confirmed items. The workbench checks for an opener event channel before the destructive confirmation request and gives a recovery instruction instead of confirming/deleting the image and losing the result. Delete remains independently available.

### Accept the split only after artifact measurement

Nutrition falls from 45,512 to 36,410 WeApp page JavaScript bytes; the private-photo route is 32,956 and the repository maximum becomes the 39,297-byte workout page. H5 total falls from 2,447,176 to 2,409,603 and its largest async JavaScript from 206,946 to 185,926 bytes. The workbench increases the WeApp total to 819,662 bytes, so the total ceiling moves narrowly from 811,000 to 820,000 while the page ceiling tightens to 39,500; H5 total and async ceilings tighten to 2,410,000 and 187,000.

## 4. Validation evidence

- Focused food-photo/nutrition model validation passed 2 files / 10 tests.
- Repository-wide unit validation passed 63 files / 276 tests.
- Strict workspace TypeScript and repository formatting passed.
- Focused PostgreSQL photo-candidate/privacy validation passed 2 files / 10 tests, covering bounded confirmation without meal creation, explicit delete, expiry, durable delete retry, consent withdrawal, export and account erasure.
- Main H5 browser validation passed 40/40 on isolated loopback API port 3110. The photo flow proves no direct photo control on nutrition, consent gating, private proof review, unconfirmed-candidate absence from the saved meal draft, preserved title, confirmed-only return, zero saved meals and explicit deletion.
- Repository production builds passed for contracts, domain, administrator, H5 and API; the WeApp production build also passed.
- Client quality measured H5 `2,409,603` total, `318,996` entry and `185,926` largest async bytes; WeApp `819,662` total, `18,915` vendor and `39,297` largest page bytes, with no forbidden validation-runtime markers.
- `pnpm audit:prod --audit-level high` retained zero critical/high findings and nine registered moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-051-lazy-food-photo-mobile.png` and `output/playwright/iteration-051-lazy-food-photo-wide.png`.

The dedicated OIDC browser suite and AI/evaluation suites were not rerun because identity, prompt, validator and worker code did not change. The unchanged main browser suite exercised the default fixture worker end to end.

## 5. Problems found and experience captured

- Moving source code between components is insufficient; registered-route overhead and both total/page trees must be measured. Reusing the private-photo route produced a real largest-page reduction without a new route runtime.
- A route return is a data-governance choice. URL parameters would expose food/portion data in navigation state, storage would outlive the handoff, and a global singleton could silently cross owners or reload boundaries. An opener channel provides a single in-memory destination.
- Confirmation is destructive because it starts media deletion. Verifying the opener before the API call prevents a direct-link user from deleting proof and then losing the confirmed draft.
- Taro H5 can omit inherited text color on secondary buttons even when the accessible name exists. Screenshot review caught the blank delete label; explicit design-token inline color fixed the rendered evidence.
- The first repository-wide integration command produced no case output and stalled on this Windows host until the shell timeout. It is not counted as a pass. The bounded photo/privacy integration command then completed 10/10 in 10.11 seconds with verbose evidence; the round changed no server code.

## 6. Global state review, remaining risks and next step

Manual meal recording and temporary AI photo proposals now have separate runtime and persistence boundaries. Confirmation still does not save a meal, and failure/rejection still does not invent a visual fallback. Local MinIO and the fixture worker remain development evidence only; production object custody, provider approval, region/retention policy, real-image evaluation and named operational ownership remain mandatory external gates.

Iteration 052 should exercise an automated accessibility state matrix across the newly lazy action/photo workbenches and the highest-risk dialogs: stable accessible names/status announcements, keyboard-only completion, deterministic focus return after navigation/dialog closure and no dependence on color or motion. It must remain locally reproducible and avoid claiming screen-reader/device support that has not been tested. Managed deployment, real identity/providers, custody/telemetry owners, policy/filing and paid canaries remain parked until the user supplies them.

## 7. References

- [Iteration 050 archive](050-lazy-owner-action-register.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [Food-photo model](../architecture/FOOD_PHOTO_MODEL.md)
- [ADR-0010](../architecture/decisions/0010-revocable-food-photo-candidates.md)
- [ADR-0024](../architecture/decisions/0024-versioned-adversarial-ai-output-safety.md)
- [ADR-0049](../architecture/decisions/0049-lazy-food-photo-proof-workbench.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
