# ADR-0006: Versioned nutrition snapshots on canonical grams

Date: 2026-07-18

Status: accepted

## Context

Food names and nutrient data vary by source, brand, preparation and database release. Referencing only a mutable catalog row would rewrite historical meals; accepting only final macro totals would make corrections, favorites and photo review unexplainable. AI photo candidates must also remain separate from confirmed user facts.

## Decision

- Store one relational meal aggregate with ordered item rows.
- Snapshot food name/category, per-100g nutrients, reference, display portion and canonical grams in each item.
- Calculate item and meal totals deterministically on the server from canonical grams; retain label energy rather than deriving it from macros.
- Derive recent foods from meal history and store user favorites as independent snapshot/default-serving upserts.
- Use idempotent create, optimistic full replacement, soft delete and an immutable full JSON snapshot for each accepted revision.
- Treat the bundled starter catalog as visibly labeled development/demo data; require a versioned, licensed and localized provider decision before beta.
- Keep photo/model candidates in a future proposal boundary; they cannot call the confirmed-meal mutation directly.

## Consequences

Historical meals remain explainable even when catalogs change, and the client can repeat or favorite exactly what the user previously saw. Snapshot duplication costs storage and can preserve an old data error, which is intentional provenance; a correction creates a new meal revision rather than silently changing the old snapshot.

Canonical grams give one calculation basis but are still an estimate for household units. The UI exposes both display unit and approximate grams. Provider IDs, release/version and attribution become mandatory when replacing the demo catalog. Public launch is blocked until that data-source and localization decision is completed.
