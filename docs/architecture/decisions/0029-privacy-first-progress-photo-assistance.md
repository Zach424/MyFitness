# ADR-0029: Privacy-first progress-photo assistance without body inference

Date: 2026-08-04

Status: Accepted for local implementation; real-image research, production custody and policy review remain release gates

## Context

Consistent body photos can help a person visually compare long-term change, but these images are sensitive and unusually easy to over-interpret. A system that assigns a body score, diagnoses posture, estimates exact body-fat percentage or labels one appearance as better would turn an alignment aid into an unsafe health claim. Keeping every photo indefinitely under one broad consent would also violate the minimum-data principle.

The existing food-photo path already strips metadata, uses private object storage and deletes through durable jobs. Progress photos need the same media controls but a different ownership purpose: food-analysis revocation must never delete progress photos, and withdrawing a machine capture check must not silently delete a photo the user separately chose to retain.

## Decision

1. The machine boundary is limited to four deterministic capture-quality checks: portrait orientation, minimum resolution, bounded brightness and bounded contrast. Results are explicitly labeled machine estimates and use adjustment guidance, never health/body classification.
2. The user chooses `front`, `side` or `back`. The system does not infer pose, anatomical landmarks, posture disorders, body composition or medical state.
3. Every reservation requires current `progress_photo_analysis` consent. `analysis_only` media expires after 24 hours. `retained` media requires a second, independently revocable `progress_photo_retention` consent and has no implicit expiry.
4. Withdrawing analysis consent deletes analysis-only/reserved media and removes machine quality data from separately retained photos. Withdrawing retention consent deletes every progress-photo record and object. Account erasure still removes the entire user prefix.
5. Raw uploads are never persisted. Sharp rotates, bounds dimensions, re-encodes JPEG and removes EXIF before private storage. New keys are scope-separated as `<user UUID>/progress/<photo UUID>.jpg`; food photos use the sibling `food` scope while legacy keys remain deletion-compatible.
6. Comparison is user-controlled and only offered for two retained photos with the same declared view. The client presents an adjustable onion-skin overlay, registration marks and capture reminders. It does not compute a change score or claim causation.
7. Every delete path is explicit or retention-driven, transactionally enqueues durable object deletion and remains visible as pending if storage is unavailable. Export and privacy inventory include active sanitized progress media and lifecycle provenance but never storage keys, fingerprints or signed URLs.
8. No external dataset or model is required for this boundary. Introducing landmark/body-composition inference later would be a new product/safety decision with licensed data, bias, privacy, expert and policy evidence rather than an extension of this feature.

## Consequences

Users can make repeatable visual comparisons without converting appearance into a medical or moral score. Separate consent and object scopes preserve the difference between temporary analysis, user-owned retained media and unrelated food-photo processing. The implementation remains locally testable with deterministic images and fixture infrastructure.

Brightness, contrast, distance, clothing and camera setup can still change perception even when all four checks pass. The interface therefore describes the result as capture readiness, shows the original visual comparison without conclusions and repeats that discomfort or health concerns belong with a qualified professional.

Retained photos increase custody obligations and portable-export size. Production requires bucket encryption/IAM/lifecycle/versioning, independent deletion/restore evidence, policy text and real-device review. The synchronous JSON export remains a closed-beta size limit.

## Alternatives considered

- Exact body-fat or posture estimation: rejected because a photo-only estimate would be unreliable, high-risk and outside the general lifestyle boundary.
- Automatic view/pose inference: rejected because the user can declare the view without adding a model, dataset or new biometric inference.
- One combined consent: rejected because capture analysis and indefinite retention are distinct purposes with different withdrawal effects.
- Delete retained photos when analysis consent is withdrawn: rejected because it would ignore the separate retention decision and surprise the data owner.
- Reuse one unscoped user photo prefix: rejected because purpose-specific revocation could cross-delete unrelated sensitive media.
- Server-generated before/after scores: rejected because they encourage over-trust and conceal capture-condition uncertainty.

## Rollback

Remove the progress-photo page and reservation routes from a later release while retaining migration 0020 and deletion/export compatibility for existing rows. Continue to honor explicit deletion, both consent withdrawals, export and account erasure. Never roll back by exposing objects publicly, retaining analysis-only media past its deadline or merging progress-photo consent into another purpose.

## References

- [Progress-photo model](../PROGRESS_PHOTO_MODEL.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [ADR-0010: revocable food-photo candidates](0010-revocable-food-photo-candidates.md)
- [ADR-0015: durable erasure and restore ledger](0015-durable-data-erasure-and-restore-ledger.md)
