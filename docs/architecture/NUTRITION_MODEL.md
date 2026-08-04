# Nutrition record model

Status: manual meal/photo records, owner-created food definitions, daily observation and explicit occurrence editing implemented through iteration 043

Nutrition records are user-confirmed snapshots of food, portion and context. They support personal recall and later deterministic summaries; they are not dietary prescriptions, laboratory measurements or judgments about food quality.

## Aggregate shape

```text
meal
├─ meal type, title, occurrence time, IANA timezone
├─ source: manual | imported
├─ optional note
└─ ordered items (1–30)
   ├─ food snapshot
   │  ├─ stable key, display name, category
   │  ├─ energy and P/C/F/(fiber) per 100g
   │  └─ optional reference
   └─ serving snapshot
      ├─ display amount and unit: g | ml | piece | serving
      └─ canonical grams
```

Each item freezes the name, category and per-100g nutrients used at the time of recording. A future food-catalog correction therefore does not silently rewrite old meals. Display amount/unit preserves the user's mental model, while canonical grams provide one calculation basis.

## Deterministic summaries

For each nutrient `n`, the server calculates:

```text
item(n) = nutrientsPer100g(n) × canonicalGrams ÷ 100
meal(n) = Σ item(n)
```

Energy, protein, carbohydrate, fat and fiber are rounded to two decimals in the authoritative API response. The client shows a one-decimal preview for macros and whole kcal for scanning, but persistence never trusts that preview.

Label energy is stored and scaled directly. It is not reconstructed from `4P + 4C + 9F`, because labels and composition databases can use different rounding, fiber and analytical methods. Values must remain non-negative and within the contract/database density bounds; the system does not claim they are exact.

## Catalog, recent and favorites

The current client ships a small **demonstration catalog** solely to prove interaction and persistence. Every entry is visibly referenced as “衡迹演示食物库 v2026-07” and can be replaced by a user's packaging/source values. It is not an approved public nutrition database.

Before beta, the project must select a licensed, localized and versioned source and persist its source ID/release. USDA FoodData Central demonstrates the required shape through its [official API guide](https://fdc.nal.usda.gov/api-guide/) and [versioned downloadable datasets](https://fdc.nal.usda.gov/download-datasets/), but China-market coverage, translations, licensing/attribution and local food composition still require a product/legal decision.

Recent foods are derived from the newest owner-visible meal snapshots, de-duplicated by food key; they are not a second mutable table. Favorites are user-owned snapshot/default-serving rows. Saving a favorite is an upsert, deletion is idempotent, and neither operation changes old meal revisions.

Owner-created foods now live in a separate versioned definition aggregate. The server generates a stable `custom:<32 hex>` key; a definition stores searchable aliases, category, bounded per-100g nutrients, a required user-confirmed reference and a default gram serving. Creation is idempotent, correction/archive require the expected revision and every accepted state has an immutable definition revision. Active names are owner-unique without pretending that equal names across owners are one identity.

Selecting a definition copies its current values into the existing meal draft/snapshot. Later correction or archive cannot rewrite that draft, a persisted meal, meal history or a favorite. Archived definitions leave normal search but stay in owner history/export until account erasure. Owner values remain reference data, not verified provider or laboratory facts.

The definition register is a dedicated H5/WeApp route; the meal page refreshes active entries on show and searches owner aliases. Food-photo candidates remain limited to the controlled starter catalog. Barcode/provider search, branded variants, recipes, non-gram household conversion rules and catalog reconciliation are deferred.

## Daily observation

`GET /v1/insights/nutrition` projects the current owner-visible meal/item graph into exactly 90 consecutive dates in one requested IANA timezone. The final date contains records no later than the optional reference instant. Each 7/30/90-day window is a suffix of that same series, so the daily ribbon and summary cannot disagree about which calendar days belong to the period.

A saved meal is user-confirmed evidence; an editor draft or photo candidate is not. Correction replaces the current item graph and soft deletion removes a meal from the projection, while immutable meal revisions remain audit history. The projection persists no rollup and creates no new export/erasure collection.

No-meal days return record counts of zero but nutrient values of `null`. They mean “no record,” never zero intake. Energy, protein, carbohydrate and fat are complete only for the saved items. Fiber additionally exposes known-label item count against total item count; known values may be summed, but no label produces `null`, not `0 g`.

The client may calculate a recorded-day average from a window total divided by `recordedDays`, and must label it exactly as such. It must not divide by missing days, infer complete intake, set targets, calculate adherence, compare users, judge food quality or provide diet/medical advice. ADR-0038 records the calendar, uncertainty and non-prescriptive boundary.

## Revisions and ownership

The current aggregate is normalized into `nutrition_meals` and ordered `nutrition_meal_items`. Creation uses a per-user idempotency key/request hash. Full replacement requires the current revision; deletion is soft deletion from routine lists. Every accepted create/update/delete appends a complete JSON snapshot to `nutrition_meal_revisions` in the same transaction.

Owner list/history/mutations are enforced by the API. Cross-user and absent resources both return `404`; stale writes return `409`. Soft deletion is an audit behavior, not completion of the privacy-erasure workflow.

The meal editor accepts an explicit local minute and IANA timezone. It rejects invalid calendars/zones, DST gaps, unresolved repeated minutes and future instants before submission; the shared write contract independently rejects future occurrence instants. An untouched correction resubmits the exact original timestamp rather than truncating its seconds/milliseconds to the visible minute.

## Repeat and AI boundaries

“再记一次” copies the food and serving snapshots into a new draft, resets occurrence time and note, and then uses normal idempotent creation. It never mutates the previous meal or copies a server identity/revision.

Food-photo assistance is a separate proposal aggregate. A private sanitized image can suggest catalog-bound foods, confidence words and portion ranges, but cannot create a meal or nutrient snapshot. The user selects and edits candidates; confirmation deletes the image and returns gram-based food drafts. Only the existing manual Save Meal path can create `nutrition_meals` and immutable meal revisions.

Photo consent, media status, prompt/validator/provider/model provenance, failure, expiry and selected draft inputs live in `nutrition_photo_candidates`, not in historical meals. Media is removed on confirmation, rejection, failure, explicit delete or 24-hour expiry. The full boundary is documented in [FOOD_PHOTO_MODEL.md](FOOD_PHOTO_MODEL.md).

The MVP excludes eating-disorder treatment, therapeutic diets and disease-specific advice. Later planning must screen the profile boundary and validate energy/macro changes before presenting them.
