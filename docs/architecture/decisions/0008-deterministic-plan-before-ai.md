# ADR-0008: Deterministic, versioned plans before AI orchestration

Date: 2026-07-19

Status: accepted

## Context

The product needs weekly training and nutrition guidance, but sending raw health records directly to a model would make constraints, version history and failure behavior difficult to test. A plan can also become unsafe or irrelevant after onboarding risks, availability or equipment change.

Population guidance from the [WHO](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity), [CDC](https://www.cdc.gov/physical-activity-basics/adding-adults/index.html), and [Chinese Nutrition Society](https://dg.cnsoc.org/article/04/wDCyy7cWSJCN6pwKHOo5Dw.html) supports conservative activity and dietary context, but does not establish a personalized prescription for an individual user.

## Decision

- Implement `deterministic-v1` as a pure domain function over an explicit onboarding revision, week and confirmed evidence snapshot.
- Return a strict seven-day contract with bounded easy/moderate sessions, equipment-compatible substitutions, qualitative nutrition focuses, reasons and provenance.
- Store one current JSONB plan aggregate per user/week plus immutable revision snapshots for generated, modified, accepted and skipped transitions.
- Require optimistic revisions for decisions and keep generation idempotent for an unchanged profile/week.
- Regenerate the existing weekly aggregate when the onboarding revision changes.
- Re-check current eligibility and profile revision at accept/modify time; permit skip even after a later risk block.
- Exclude calorie deficits, nutrient gram targets, vigorous sessions and medical claims from this engine.
- Require later model output to conform to the same contract and deterministic validators instead of creating a parallel AI-only plan shape.

## Consequences

The complete planning path is usable and testable without a model provider, and users can see why a plan exists, change substitutions and inspect every decision. JSONB keeps the aggregate atomic while relational keys preserve ownership and week queries; Zod validation and immutable snapshots limit schema ambiguity.

The rule set is deliberately conservative and not outcome-validated. It will need evaluation fixtures, catalog/version governance and completion feedback before it can adapt load. A current plan can become stale after profile changes, so every actionable mutation must keep the server-side re-check even if the client later adds proactive warnings.
