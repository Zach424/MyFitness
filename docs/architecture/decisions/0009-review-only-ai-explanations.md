# ADR-0009: Review-only, revision-bound AI explanations

Date: 2026-07-19

Status: accepted

## Context

The deterministic weekly plan already owns training and nutrition decisions. Allowing a language model to mutate that plan would create a second safety authority, weaken revision history, and make refusal or provider downtime part of the core planning path. Health-related input also requires explicit purpose-bound consent and strict minimization.

## Decision

- Use AI only to explain an existing actionable plan; the model cannot create or modify plan fields or confirmed health records.
- Put provider-specific HTTP behavior in a separately deployable FastAPI worker. NestJS remains responsible for authentication, authorization, consent, idempotency, lifecycle, persistence, and final validation.
- Send a minimized structured context with selected actions and aggregated evidence, never user identity or raw record histories.
- Bind every run to a plan revision, consent version, prompt version, validator version, provider, model, and input fingerprint.
- Reserve a pending row before the potentially costly call and scope idempotency keys to the user.
- Require strict structured output plus a deterministic validator; convert every failure or unsafe result into a visibly labeled deterministic fallback.
- Keep local development on a no-cost fixture. Configure the OpenAI Responses adapter with `store: false`; enabling it in production requires separate retention, regional-processing, quality, cost, and legal approval.

## Consequences

The planning experience works without a model and remains deterministic under failure. Explanations are reproducible enough to audit, stale results cannot masquerade as current, and provider migration does not change the public API.

The boundary adds a second runtime, a pending-run recovery concern, and duplicated schema enforcement across Python and TypeScript. Keyword validation is intentionally conservative and may reject harmless negations, so the evaluation corpus, validator version, and copy must evolve together. A successful mock adapter test is not evidence that real-provider quality, latency, cost, or data handling is ready for release.
