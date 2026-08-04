# Iteration 039 — User-owned food catalog and provenance

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

The meal aggregate already stored immutable food/serving snapshots, but a missing food could only be entered once with a generated timestamp key. Iteration 039 closes the bounded definition gap: an owner can create, find, reuse, correct, archive and inspect versions of a food while old meal and favorite facts remain unchanged.

Success requires strict shared contracts and database bounds; explicit user-confirmed nutrition provenance; owner isolation; idempotent creation; optimistic correction/archive; immutable definition revisions; selection into a meal snapshot; privacy inventory/export/erasure coverage; H5/WeApp behavior; OpenAPI agreement; and all repository gates to stay green.

This round does not import a public food corpus, call a barcode/nutrition provider, reconcile brands, recompute recipes from ingredients, generate calorie targets or make diet/medical claims. Photo analysis remains bound to the controlled starter allow-list.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` now exports a versioned starter/custom food catalog union, strict create/update/history schemas and one required reference field. The existing meal snapshot contract remains the fact boundary.
- Migration `0025_user_food_catalog.sql` adds owner definitions, active-name/idempotency uniqueness, optimistic revisions and immutable revision snapshots. Every owner foreign key cascades for account erasure.
- `apps/api/src/food-catalog` adds list/create/correct/archive/history endpoints with the same ownership, conflict and request-hash discipline used by other editable aggregates.
- `apps/client` adds a dedicated `pages/food-catalog` register for definition lifecycle. The nutrition page refreshes the combined starter/custom directory on show, searches custom aliases and copies the selected definition into a meal draft.
- Privacy inventory counts definitions under nutrition. `myfitness-portable-export-v4` adds `foodCatalog` with active/archived rows and history while excluding idempotency/request fingerprints.
- The committed OpenAPI document, ADR-0037, nutrition/privacy/architecture/design models, roadmap, README and project status describe the same definition/fact/safety boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. No runtime dependency, real provider, cloud account or paid service was added.

## 3. Implementation method

### Keep definition identity stable and owner-scoped

The server generates a UUID and exposes `custom:<32 hex>` as the stable food key. Creation normalizes a parsed definition, hashes it and serializes owner creation behind a user row lock. Replaying the same idempotency key/body returns the same entry; changing the body conflicts. Active names are case-insensitively unique per owner, while the same name may exist for another owner.

Definitions store name/aliases, category, energy/P/C/F/optional fiber per 100g, a required reference and a default gram serving. Correction and archive lock the owner row and compare `expectedRevision`; every successful mutation appends the returned definition snapshot before commit. Archived rows are excluded from normal list but remain queryable through owner history/export.

### Snapshot into meals instead of live joining

Selecting a starter or owner entry constructs a fresh `FoodSnapshot` and serving draft. The meal API already writes those facts into `nutrition_meal_items` and complete meal revision JSON. Integration proof creates a meal from revision 1, corrects the definition's name/energy/fat/reference, archives it, then verifies the meal still returns revision-1 values.

Favorites remain independent snapshot/default-serving rows. Definition archive does not remove a favorite, and neither definition nor favorite changes can rewrite a prior meal. The required reference travels with each selected snapshot so packaging/recipe/manual basis remains visible without being called verified.

### Separate mutable catalog management from the meal ledger

The first complete UI embedded create/correct/archive/history below the meal picker. Behavior tests passed, but the WeApp nutrition page reached `46,721` bytes against a `45,000`-byte ceiling. The register moved to its own lazy route. The nutrition page now owns only selection/search/snapshot behavior and refreshes after returning; the register owns definitions and revision history.

This split restored the largest WeApp page to `39,472` bytes. Total artifact ceilings moved only for the new route, to 2.00 MB H5 and 725 KB WeApp. Entry, async JavaScript, vendor and page ceilings did not move.

### Preserve the AI and privacy boundary

The food-photo worker still receives only starter catalog keys; owner definitions are never silently added to the candidate allow-list. The UI says user values are reference data rather than laboratory measurements and produces no target or intake advice.

Portable export v4 adds one explicit `foodCatalog` collection with revision history. Inventory counts the definition as a recognizable nutrition record. Request hashes/idempotency keys are stripped. Cascading owner foreign keys make both definition tables part of the existing durable erasure graph without a separate deletion job.

## 4. Validation evidence

- Focused contract/client unit validation passed 2 files / 8 tests, including explicit provenance bounds and independent meal-draft copying.
- The new PostgreSQL integration passed 2/2. It proves starter versioning, idempotency replay/conflict, active-name uniqueness, cross-owner isolation, meal snapshot immutability, stale correction conflict, archive/history order, privacy count and portable export v4.
- Repository-wide unit validation passed 50 files / 221 tests.
- PostgreSQL integration validation passed 15 files / 57 tests.
- Strict TypeScript passed across all six product/shared workspaces. API production build and committed OpenAPI generation passed.
- Main H5 browser validation passed 27/27 and the dedicated OIDC build passed 3/3, for 30 browser cases. The new mobile flow creates from a recipe reference, returns to add the definition, corrects it, proves the existing draft kept the old snapshot, reads R2/R1 history, archives and proves the draft still remains. Captured page/console errors are empty.
- H5 and WeApp production builds passed. Client quality measured H5 `1,946,951` total bytes, `313,016` entry bytes and `189,924` largest async JavaScript; WeApp `707,840` total bytes, `18,915` vendor bytes and `39,472` largest page JavaScript. All remain below reviewed budgets with no forbidden validation-runtime markers.
- `pnpm audit:prod` passed the critical/high gate with 9 known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-039-user-food-catalog-mobile.png`.

## 5. Problems found and experience captured

- A reusable favorite is still not a definition. Favorites freeze a convenient selection; editable catalogs need identity, provenance, correction, archive and history.
- Required provenance improves honesty but does not establish accuracy. Keep owner claims visibly owner-confirmed and never relabel them as provider or laboratory truth.
- Definition correction and meal correction are different actions. A catalog edit must not mutate an already selected draft, persisted meal or favorite.
- Stable identity belongs to a server key, not the current display name. Aliases support discovery without becoming alternate database identities.
- AI allow-lists are trust boundaries. A useful custom catalog should not automatically become a trusted vision/barcode matching corpus.
- Privacy schema versions should change when the portable shape changes. Adding `foodCatalog` moved v3 to v4 and updated contract, OpenAPI, API and integration expectations together.
- Bundle gates should shape screen ownership. The failed 46,721-byte embedded page led to a clearer dedicated register while retaining the 45 KB page limit.
- Auth-mode E2E requires its matching build artifact. Main H5 and OIDC H5 are separately generated/tested; the local preview is restored to development mode afterward.

## 6. Global state review, remaining risks and next step

The nutrition loop now moves from a versioned starter or owner definition to an immutable meal/favorite fact with correction-safe provenance and full privacy ownership. It still does not provide a licensed China-localized production corpus, branded identity reconciliation, household conversion rules, recipe computation, barcode lookup or evidence-based dietary prescription. User-entered values may be incomplete or wrong, and energy/macro surfaces retain eating-disorder risk.

The next largest local product gap is longitudinal nutrition observation. Iteration 040 should add a timezone-aware, confirmed-meal-only 7/30/90-day daily projection with energy/macros/fiber, meal counts, correction/deletion recomputation, bounded points and non-prescriptive copy. It must not compare users, score food quality, infer adherence or recommend intake. Managed deployment remains parked until account, budget, domain, identity, custody, telemetry and policy owners are supplied.

## 7. References

- [Iteration 038 archive](038-exercise-level-history-and-trends.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0006](../architecture/decisions/0006-nutrition-snapshot-aggregate.md)
- [ADR-0037](../architecture/decisions/0037-user-owned-food-catalog.md)
- [Nutrition model](../architecture/NUTRITION_MODEL.md)
- [Privacy ownership model](../architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
