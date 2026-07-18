# Health record model — measurement foundation

Status: implemented for body and recovery measurements in iteration 002

## Purpose and boundary

The first persisted record is a numeric measurement, not a universal JSON bucket. It covers body and recovery signals whose unit and plausible range can be validated deterministically. Workout sets, meals, photos and plans will receive dedicated versioned schemas in later iterations.

## Contract fields

| Field                             | Owner             | Rule                                                                        |
| --------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `id`, `userId`                    | API               | UUIDs; user context is never taken from the request body                    |
| `metric`                          | Contract/domain   | One of 9 versioned body or recovery metric codes                            |
| `value`, `unit`                   | Request           | User/device display value and unit                                          |
| `canonicalValue`, `canonicalUnit` | Domain/API        | Deterministically converted before persistence                              |
| `source.kind`                     | Contract/database | `manual`, `device`, `imported`, or `ai_estimate`                            |
| `source.metadata`                 | Contract/database | Provider/device/external/model/prompt provenance without direct identifiers |
| `confidence`                      | Contract/database | Required in `[0,1]` only for AI estimates                                   |
| `status`                          | Contract/database | AI starts as `candidate`; non-AI measurement creation is `confirmed`        |
| `occurredAt`, `timezone`          | Request/database  | Offset timestamp plus valid IANA timezone                                   |
| `revision`                        | API/database      | Starts at 1; later edits create controlled revisions                        |
| `idempotency key`                 | Header/database   | Unique per user; same body replays, changed body conflicts                  |
| `createdAt`, `updatedAt`          | Database          | Server timestamps in UTC                                                    |

## Metric and unit matrix

| Metric                    | Accepted display units | Canonical unit | Guardrail                                               |
| ------------------------- | ---------------------- | -------------- | ------------------------------------------------------- |
| `body.weight`             | kg, lb                 | kg             | 20–500 kg                                               |
| `body.waist`              | cm, in                 | cm             | 30–300 cm                                               |
| `body.body_fat`           | percent                | percent        | 1–75%; device/visual estimates remain labeled estimates |
| `body.resting_heart_rate` | bpm                    | bpm            | integer 25–250 bpm                                      |
| `recovery.sleep_duration` | minute, hour           | minute         | 0–1440 min                                              |
| `recovery.sleep_quality`  | score 1–5              | score 1–5      | integer                                                 |
| `recovery.soreness`       | score 1–5              | score 1–5      | integer                                                 |
| `recovery.energy`         | score 1–5              | score 1–5      | integer                                                 |
| `recovery.stress`         | score 1–5              | score 1–5      | integer                                                 |

Guardrails reject obvious unit/input errors; they are not clinical normal ranges and must never be presented as diagnosis.

## Defense in depth

1. Zod rejects malformed time, timezone, status and provenance combinations at the HTTP boundary.
2. Domain functions validate metric/unit compatibility, convert to canonical units and reject implausible values.
3. Parameterized SQL prevents payload interpolation into queries.
4. PostgreSQL constraints independently prevent AI-confirmed rows, missing AI provenance, invalid confidence/status values and duplicate idempotency keys.
5. The migration runner records a SHA-256 checksum and fails if an applied migration is edited.

This overlap is intentional: a future worker, import path or administrative tool must not be able to bypass the product's core fact-versus-estimate invariant merely by avoiding one controller.
