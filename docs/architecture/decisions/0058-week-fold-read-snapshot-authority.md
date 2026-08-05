# ADR-0058: Week Fold reads one authority snapshot before enabling decisions

Date: 2026-08-05

Status: accepted

## Context

Week Fold composes the current weekly-plan list, workout candidates, plan decision history and AI explanation history. Before this decision, a failed first list read fell through to the same `NO WEEK YET` presentation as a successful empty list. A later list or history failure could leave the old fold visible while plan decisions, workout associations and provider calls remained enabled. Fetching the histories after assigning the current plan also allowed a partially refreshed projection to be mistaken for one coherent revision.

Persisting a sensitive plan cache or replay queue is outside this local reliability scope. The page already has explicit response-loss reconciliation for writes; read uncertainty needs a separate boundary that never initiates a write or provider call.

## Decision

- Model `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` independently of whether the plan list is empty.
- Treat the plan list, workout candidates, current plan decision history and current plan AI history as one in-memory presentation snapshot. Apply them only after every required read succeeds.
- A failed first read must not render `NO WEEK YET` or enable generation. A failed later read retains the last accepted plan/revision/history snapshot and labels it read-only.
- Classify offline transport, HTTP 4xx refusal, HTTP 5xx service outage and unknown failure into product-owned copy without exposing backend messages.
- Require `ready` read authority before generation, substitution, adoption, skip, workout link/unlink or AI authorization/provider calls. Existing ambiguous-write recovery may still perform its narrowly defined read-side reconciliation.
- Provide one foreground retry with concurrent-call guards and explicit pointer/Enter/Space semantics. Initial failure and an explicitly requested failed version check move H5 focus to that retry; silent foreground-return checks do not steal focus.
- Do not add polling, persistent sensitive-data cache, offline database, optimistic plan facts or mutation replay.

## Consequences

An empty Week Fold now means the service authoritatively returned no weekly plan. A retained fold remains useful as evidence while making its stale authority visible, and all decisions/provider work stay frozen until one complete snapshot succeeds. The retained state exists only in current page memory and has no persisted timestamp, cross-device guarantee or offline-access promise.

The state model and presentation add 6,154 bytes to H5 and 7,253 bytes to WeApp. H5 entry/largest async remain effectively unchanged at 319,235/199,198 bytes; WeApp vendor remains 18,915 while Week Fold grows from 49,800 to 55,523 bytes. Narrow ceilings move to 2,620,000 H5 total, 906,000 WeApp total and 56,000 largest WeApp page; entry, async and vendor ceilings remain fixed.
