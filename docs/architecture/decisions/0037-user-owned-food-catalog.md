# ADR-0037: User-owned food definitions remain separate from meal facts

Date: 2026-08-05

Status: accepted

## Context

Meals already freeze a food name, category, per-100-g nutrients, optional reference and serving. The client also allowed a one-off `custom:` snapshot, but that value could not be reused, corrected, archived or audited. Favorites were reusable snapshots, not an editable source definition. The starter catalog remains demonstration data and cannot cover household recipes, branded foods or local products.

A mutable live catalog must not become historical truth: changing a recipe estimate or packaging label later cannot silently change an accepted meal, favorite or old meal revision. User-entered values also cannot be presented as licensed-provider facts or laboratory measurements. Allowing those entries into the current photo-candidate allow-list would incorrectly promote unreviewed owner data into an AI-supported match.

## Decision

1. Add a versioned starter food projection and owner-scoped custom definitions at `/v1/food-catalog`. A custom definition has a server-generated stable `custom:<UUID-without-hyphens>` key, name, searchable aliases, category, bounded per-100-g energy/macros/fiber, required human-readable data reference and a default gram serving.
2. Create custom definitions idempotently with a per-owner request key and hash. Correct with an expected revision, archive instead of hard-delete and append a complete immutable definition snapshot for `created`, `updated` and `archived` in the same transaction.
3. Keep active-name uniqueness case-insensitive within one owner. Return cross-owner and absent definitions as the same not-found boundary; reject stale revisions and idempotency-key reuse with conflicts.
4. Copy the selected definition into the existing meal-item snapshot. A later definition correction/archive never updates current meal drafts that already selected it, persisted meals, meal revisions or favorites. Favorites continue to be independent snapshots.
5. Require a visible owner-confirmed reference such as a dated packaging label or recipe estimate. Copy that reference into a meal snapshot. Do not label the value verified, calculate a dietary target or generate an intake prescription.
6. Keep food-photo candidate generation bound only to the controlled starter allow-list. Custom definitions require a separate reviewed identity/reconciliation policy before they can participate in image or barcode matching.
7. Include active and archived custom definitions plus immutable revisions in `myfitness-portable-export-v4`; exclude idempotency keys, request hashes and owner foreign-key duplication. Count definitions in the stable nutrition inventory category. Account erasure relies on owner foreign keys with cascade deletion.
8. Put definition create/correct/archive/history on a dedicated H5/WeApp register page. The meal page refreshes active catalog entries when shown and only selects/copies them. This keeps mutable definition management visually and technically separate from the meal fact ledger.
9. Treat an ambiguous create response as the same idempotent request while the form is unchanged. Correction and archive are never blindly replayed: the register first reloads the active owner catalog, accepts a lost correction only when an advanced revision exactly matches every retained field and treats absence after archive only as evidence that the definition left future choices. Nutrient/reference input remains visible owner-authored data, not verified nutrition.

## Consequences

Users can define missing foods once, find them by name or alias and correct future reuse without losing an audit trail or rewriting old meal evidence. The required reference makes provenance visible but does not prove accuracy. Archived definitions leave normal search while historical meals, favorites and export history remain intact until account erasure.

Committed-but-lost browser responses no longer force duplicate food definitions or false correction/archive success. The create key exists only in memory and resets on input change; correction/archive reconciliation is explicit and foreground-only. There is no offline queue, background replay or new nutritional-authority claim.

The dedicated page restores the unchanged 45 KB WeApp page-JavaScript ceiling after an embedded editor reached 46,721 bytes. One additional lazy route raises only reviewed total-tree ceilings: H5 from 1.85 MB to 2.00 MB and WeApp from 700 KB to 725 KB. H5 entry/async and WeApp vendor/page limits remain unchanged.

The model does not yet support branded-provider IDs, household-unit conversion rules beyond the saved default gram serving, recipe ingredient recomputation, barcode lookup, duplicate identity merging or catalog release migrations. Those require explicit source licensing, localization and reconciliation decisions.

## Alternatives rejected

- Keep generating timestamp keys in a one-off form: cannot safely reuse, correct, archive or export a definition history.
- Treat favorites as the editable catalog: a favorite is a selected snapshot and changing it would blur fact versus definition semantics.
- Live-join meals to the current definition: silently rewrites accepted nutrition history.
- Let users overwrite starter entries: loses version identity and mixes demonstration/provider data with owner claims.
- Add custom entries to photo candidates automatically: turns unreviewed owner data into an AI-supported identity claim.
- Put the full editor inside the meal page: exceeded the enforced WeApp page budget and weakened the definition/fact boundary.
