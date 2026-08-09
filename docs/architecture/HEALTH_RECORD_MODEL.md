# Health record model — measurement foundation

Status: create/edit/history/delete, exact-metric observation, explicit occurrence editing, conflict-safe correction recovery and current/history pagination implemented through iteration 047

## Purpose and boundary

The first persisted record is a numeric measurement, not a universal JSON bucket. It covers body and recovery signals whose unit and plausible range can be validated deterministically. Workout sets, meals, photos and plans will receive dedicated versioned schemas in later iterations.

## Contract fields

| Field                             | Owner             | Rule                                                                         |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `id`, `userId`                    | API               | UUIDs; user context is never taken from the request body                     |
| `metric`                          | Contract/domain   | One of 9 versioned body or recovery metric codes                             |
| `value`, `unit`                   | Request           | User/device display value and unit                                           |
| `canonicalValue`, `canonicalUnit` | Domain/API        | Deterministically converted before persistence                               |
| `source.kind`                     | Contract/database | `manual`, `device`, `imported`, or `ai_estimate`                             |
| `source.metadata`                 | Contract/database | Provider/device/external/model/prompt provenance without direct identifiers  |
| `confidence`                      | Contract/database | Required in `[0,1]` only for AI estimates                                    |
| `status`                          | Contract/database | AI starts as `candidate`; non-AI measurement creation is `confirmed`         |
| `occurredAt`, `timezone`          | Request/database  | Offset timestamp plus valid IANA timezone                                    |
| `revision`                        | API/database      | Starts at 1; accepted edits/deletion increment it under an expected revision |
| `idempotency key`                 | Header/database   | Unique per user; same body replays, changed body conflicts                   |
| `createdAt`, `updatedAt`          | Database          | Server timestamps in UTC                                                     |

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

1. Zod rejects malformed/future time, timezone, status and provenance combinations at the HTTP boundary.
2. Domain functions validate metric/unit compatibility, convert to canonical units and reject implausible values.
3. Parameterized SQL prevents payload interpolation into queries.
4. PostgreSQL constraints independently prevent AI-confirmed rows, missing AI provenance, invalid confidence/status values and duplicate idempotency keys.
5. The migration runner records a SHA-256 checksum and fails if an applied migration is edited.

This overlap is intentional: a future worker, import path or administrative tool must not be able to bypass the product's core fact-versus-estimate invariant merely by avoiding one controller.

## Lifecycle and audit trail

- `POST /v1/health-records` creates revision 1 and stores a `created` snapshot in the same transaction. Replaying the same user/idempotency/body returns the original record; changed content conflicts.
- `PUT /v1/health-records/:recordId` is a complete replacement. The request carries `expectedRevision`; a matching live owner record increments the revision and appends an `updated` snapshot. Stale revisions return `409` rather than overwriting a concurrent change.
- `DELETE /v1/health-records/:recordId` carries `x-expected-revision`, sets `deleted_at`, increments the revision and appends a `deleted` snapshot. Routine lists exclude it; no physical health value is silently erased by the UI action.
- `GET /v1/health-records/:recordId/history` returns snapshots newest first, including after soft deletion, but only to the authenticated owner. Cross-user reads and mutations return `404`.
- `health_record_revisions` repeats the metric/unit/source/status safety constraints. A unique `(record_id, revision)` key prevents two accepted states from claiming the same version.

Occurrence time and timezone remain user-domain facts; `createdAt`, `updatedAt` and `changedAt` are server timestamps. The client accepts an explicit local minute and IANA zone, rejects DST gaps/future instants and requires an offset choice for repeated minutes. On correction it preserves the exact original seconds/milliseconds unless the user changes local time, timezone or offset. Later import/admin paths must add actor/reason metadata before they may mutate records.

An unsaved correction draft retains the record UUID and the revision used to open the editor. Restore reads that exact current owner record and requires the same revision; a changed or deleted record is not restored or submitted even when the aggregate is older than the first list page. The subsequent update still sends `expectedRevision`, so a race after restore produces the normal `409` rather than overwriting newer evidence. The draft metadata never enters the health-record write contract or revision history.

## Current-list pagination

`GET /v1/health-records` accepts optional `limit` (1–100) and an opaque cursor and returns `{ items, nextCursor }`; an omitted limit preserves the former 100-row behavior. Current, non-deleted owner rows use `(occurred_at, created_at, id)` descending. The cursor contains only a version, record UUID and revision; the API obtains the old sort tuple from the immutable owner revision, so later occurrence correction or deletion of the anchor does not invalidate continuation. `GET /v1/health-records/:recordId` returns one current owner-visible record for off-page workflows and returns `404` for missing, deleted or cross-owner targets.

`GET /v1/health-records/:recordId/history` independently accepts `limit` (default 20, maximum 50) and the same opaque cursor shape, but orders only by immutable revision descending. The cursor UUID must equal the path UUID and the exact owner revision must exist before the service reads `revision < boundary`. Soft deletion remains readable to the owner, while missing/cross-owner aggregates are concealed and invalid/cross-resource cursors fail with `400`. The client opens with 10 versions and explicitly loads older pages.

## Exact-metric observation

`GET /v1/insights/health/:metric` reads current, non-deleted, confirmed rows for exactly one shared metric code. AI candidates, other metrics, future records and other owners do not contribute. Complete 7/30/90 elapsed-day windows expose record count, distinct dates in the requested timezone and minimum/maximum/average in the metric's canonical unit.

The latest 180 current points retain canonical value/unit and the original display value/unit, source provenance, occurrence instant, original record timezone and current revision. Correction and soft deletion recompute the projection from `health_records`; immutable revisions remain history rather than simultaneous trend facts. No rollup is persisted or added to privacy export.

The dedicated client page may position values on a relative calibration strip, but higher/lower carries no positive or negative meaning. It must not combine metrics/units, include candidates, diagnose, define normal ranges, grade goals, compare people or prescribe behavior. ADR-0039 records this boundary.

## Cross-domain history-calendar participation

`GET /v1/insights/history-calendar` counts each current, non-deleted, confirmed health record on the local date obtained from `occurred_at` in the requested IANA timezone. It intentionally combines body and recovery into one source count and exposes neither values nor metric labels. Candidate rows, later-than-reference rows, immutable revisions and other owners never contribute. Correction can move the count to another local date; soft deletion removes it on the next read. A selected calendar day may prefill the editor's date and timezone, but no occurrence instant exists until the user adds a valid local minute.

## Calibrated subjective recovery state

`GET /v1/insights/dashboard` treats confirmed energy, sleep-quality, stress and soreness records as time-stamped self-reports, not direct facts about physiological readiness. `subjective-recovery-state-v1` selects at most the latest record per local day and metric, excludes AI estimates, invalid values and future observations, and retains record UUID, revision, occurrence time, source kind and window on every evidence reference.

The estimate uses a 7-day recent window and the preceding 28 days as a personal baseline. Fewer than two recent local days or two metrics remains `unknown` with no score. Sufficient recent coverage without at least seven baseline days and two comparable metrics is `current_only` with low confidence. A baseline comparison reaches moderate confidence only with at least three recent days, three comparable metrics and aligned factors; a 50-point factor range is explicitly `mixed` and remains low confidence. Only a moderate, aligned estimate yields a planning readiness value. These thresholds are versioned heuristics, not validated physiology, diagnosis, treatment or causal attribution; ADR-0097 records the boundary.

New weekly plans snapshot that complete state estimate and its record references alongside the narrower readiness projection. A current accepted plan may then read confirmed, non-AI recovery records occurring during its seven-day post-adoption review window. Those later records remain independent current health facts: correction or deletion changes the read-only review, no duplicate outcome row is persisted, and their presence is labelled only as observed follow-up evidence. Missing records remain Unknown; neither presence nor direction proves that the plan caused a change. ADR-0098 records the revision and causality boundary.
