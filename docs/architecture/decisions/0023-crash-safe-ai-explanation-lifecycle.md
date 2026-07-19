# ADR-0023: Crash-safe AI explanation lifecycle

Date: 2026-07-20

Status: accepted

## Context

ADR-0009 reserves an AI explanation row before contacting the worker so consent, provenance and idempotency exist before external work. If the API process stopped after that commit, the row could remain `pending` forever. The same idempotency key would then always return an in-progress conflict, while starting a different key could duplicate external work. A release-safe lifecycle must converge after process loss without retaining prompts, raw health history or additional user identifiers, and without letting an operations action call a model or modify a weekly plan.

The worker HTTP call already has a bounded timeout. Recovery therefore needs a later database deadline, a safe terminal result that exists before the external call, multi-replica concurrency control, and evidence that a late worker response and reconciliation cannot publish different outcomes.

## Decision

- Build and schema-validate the deterministic fallback from the minimized structured plan context before reservation. Store it temporarily as `recovery_content`; do not store the prompt or serialized context.
- Store `expires_at` on every run and require `AI_RUN_STALE_MS` to exceed `AI_SERVICE_TIMEOUT_MS` by at least five seconds. Migration 0017 gives legacy pending rows a generic validated recovery object and recoverable deadline.
- Reconcile expired rows at runtime startup and on a configurable interval. Metadata-only application assembly does no background reconciliation I/O.
- Claim a bounded ordered set with `FOR UPDATE SKIP LOCKED`, then atomically complete each row as `fallback` / `unavailable` / `orchestrator-recovery-v1` / `provider_timeout`. Clear `recovery_content` whenever a run completes.
- On an identical retry, reconcile the row immediately when its deadline has passed; otherwise retain the existing in-progress conflict.
- If normal worker completion loses the update race, read and return the already completed row. One run therefore has one terminal result regardless of which path wins.
- Expose only aggregate pending/expired/reconciled counts, oldest-pending time and a bounded manual pass through operations-token-protected, no-store private endpoints. Do not expose IDs, users, plans, prompts, contexts or explanation content.
- Reconciliation never contacts an external provider and never creates or mutates a plan or confirmed health record.

## Alternatives considered

- Leave rows pending and require users to create new keys. This strands provenance, creates confusing permanent conflicts and can duplicate provider work.
- Delete expired rows. This loses audit/idempotency history and makes an ambiguous request appear never to have existed.
- Persist the prompt or minimized context and retry the provider in the background. This increases sensitive-data retention, cost and duplicate-call risk, and makes incident recovery depend on an external system.
- Store only a generic failure without an explanation body. That breaks the existing strict completed-run contract and gives the user no safe result.
- Use an external cron as the sole recovery mechanism. A cron can be added later, but correctness would then depend on separately provisioned infrastructure and would not close the startup/idempotent-retry paths.

## Consequences

An API crash no longer creates a permanently pending explanation. Recovery is deterministic, locally available, visible as a fallback and safe across multiple API replicas. Operations can measure and advance the lifecycle without receiving health content or triggering model calls. Late valid provider output may lose to the fallback once the published deadline passes; this is intentional bounded behavior, and the result remains auditable through the versioned recovery model and failure code.

The database temporarily contains a second copy of derived explanation content while a run is pending, although it contains no raw prompt/context and is cleared at completion. Runtime polling is local process work and still needs centralized alerts and a named owner in the managed environment. The migration fallback for legacy rows is generic because historical minimized context was deliberately not retained.
