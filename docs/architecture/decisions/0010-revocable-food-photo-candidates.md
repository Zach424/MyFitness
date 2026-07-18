# ADR-0010: Revocable, catalog-bound food-photo candidates

Date: 2026-07-19

Status: accepted for local implementation

## Context

Meal photos can reduce recording effort, but they are sensitive media and visual food/portion inference is uncertain. Letting a model create a meal would mix an estimate with confirmed history, allow invented nutrient data, and make provider availability part of the manual record loop. Public image URLs or retaining originals would also exceed the minimum data needed for review.

## Decision

- Treat the image and every derived candidate as a temporary proposal, separate from `nutrition_meals`.
- Require affirmative current-version consent for each reservation and owner-scoped idempotency.
- Accept only JPEG/PNG/still WebP, never persist the raw upload, and use Sharp to rotate, bound dimensions, re-encode JPEG and strip metadata before storage/provider access.
- Keep media private behind action/owner/expiry-bound HMAC links; delete it on confirmation, rejection, failure, explicit deletion or 24-hour expiry.
- Allow the model to choose only exact food keys/labels from the supplied versioned catalog, using confidence words and portion ranges. Nutrients remain deterministic catalog snapshots.
- Run strict schema and deterministic domain validation after the worker. Do not invent a visual fallback.
- Confirmation returns gram-based food drafts and deletes media; saving a meal remains a separate explicit user action.
- Keep fixture mode default and visibly labeled. Real image-provider enablement requires privacy/region/retention/cost/quality approval.

## Consequences

The manual meal loop continues to work during provider failure, AI output cannot silently become history, and privacy deletion is part of the happy path rather than an administrative afterthought. The API has auditable consent, prompt/validator/model/failure provenance without storing raw provider input.

The implementation adds multipart/CORS behavior, a filesystem/database consistency boundary, expiry reconciliation and duplicated Python/TypeScript schemas. Local private disk is unsuitable for horizontal production replicas and must be replaced by lifecycle-managed object storage. A migration regex escape defect discovered after local application required additive migration `0009`; applied migrations remain immutable.
