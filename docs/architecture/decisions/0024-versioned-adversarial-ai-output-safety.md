# ADR-0024: Versioned adversarial AI output safety

Date: 2026-07-20

Status: accepted

## Context

ADR-0009 and the food-photo boundary require strict structured output plus deterministic validation before model-derived text is displayed. The initial validators checked literal phrases, catalog keys, ranges and grounded numbers. Common Unicode transformations could preserve a harmful meaning while evading those literal checks: full-width characters, zero-width format characters and spaces/punctuation between sensitive words or digits. Food photos also create a prompt-injection surface because text visible inside an image is untrusted input, while the returned summary and visual basis are displayed to the user.

Changing the validator or photo prompt without changing provenance would make old and new results indistinguishable. Conversely, making the public contract accept only the new version would break historical AI explanations and candidates during a rolling deployment.

## Decision

- Add one shared server-side display-copy policy used by plan explanations and food-photo candidates. Normalize a separate matching view with Unicode NFKC, remove `Cf` format characters, lowercase Latin text and remove whitespace/punctuation/symbol separators before matching medical, prescriptive, weight/energy and instruction-control patterns.
- Normalize numbers separately: NFKC plus format-character removal and digit-internal separator joining. Compare extracted values to the existing context allow-list. Do not mutate or replace the stored/displayed output.
- Reject Chinese and English instruction leakage, including spaced/hidden variants of “ignore previous instructions”, “system prompt” and developer-message language.
- Version the plan validator as `plan-explanation-safety-v2`; keep the plan prompt at v1 because its input boundary is unchanged.
- Version the food-photo prompt and validator as `food-photo-candidates-v2` and `food-photo-catalog-safety-v2`. The prompt treats every word visible inside an image as untrusted data, never follows/repeats/reveals it and rejects instruction-dominant images.
- Accept v1 and v2 provenance in persisted/public read schemas, but require the current v2 values in new API-to-worker requests. Migration 0018 widens the database checks without rewriting historical rows.
- Replace validity-only evaluation with exact expected reason vectors/reasons. Commit new 12-case plan and 11-case photo corpora and reproducible reports; keep the original v1 corpora/reports as historical evidence.
- Preserve existing fail-closed behavior: unsafe plan output becomes a visibly labeled deterministic fallback; unsafe photo output becomes a typed failure and durable media deletion, never an invented candidate or automatic record write.

## Alternatives considered

- Add more raw regular expressions without normalization. This remains easy to bypass with equivalent Unicode or separator changes.
- Rely on the model prompt alone. Prompt instructions are probabilistic and cannot be the final authority for health-adjacent output.
- Normalize and store rewritten prose. That changes what the provider returned, weakens auditability and risks presenting surprising text to the user.
- Relabel all historical rows as v2. Historical output was not evaluated by the new policy, so retroactive provenance would be false.
- Accept only v2 in public response schemas. That would make valid stored v1 history unreadable during upgrades and violate the audit boundary.

## Consequences

Covered Unicode and instruction-leakage variants now converge to deterministic rejection before display. New and historical provenance remain distinguishable and readable, and the database/API/worker contract can roll forward without a flag day. Exact-reason evaluation also detects cases that fail for an unintended reason instead of proving the intended control.

The policy remains a conservative phrase-based layer. It can reject harmless negations and cannot establish semantic safety against arbitrary homoglyphs, encoded languages, visual attacks or novel phrasing. The photo prompt reduces instruction-following risk but does not prove real-image robustness. Expert review, real/obfuscated image evaluation and an approved provider canary remain release gates.
