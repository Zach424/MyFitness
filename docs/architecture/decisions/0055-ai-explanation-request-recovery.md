# ADR-0055: AI explanation recovery reads one exact durable request

Date: 2026-08-05

Status: accepted

## Context

AI plan explanations are review-only, revision-bound outputs. The API reserves a durable row before contacting the worker, scopes the idempotency key to the owner and eventually completes every run with validated provider content or a deterministic fallback. If the browser loses a successful response, the former client retained the key but displayed only a generic error. The history endpoint lists completed runs without their idempotency keys, so a same-revision history item cannot prove it belongs to the interrupted attempt. Blindly issuing a new key would create another consent event and provider call; replaying the POST is idempotent but unnecessarily mixes read recovery with a provider-capable route.

## Decision

- Add an authenticated `GET /plans/weekly/:planId/explanation-request` projection keyed by the original `x-idempotency-key` header. It returns a strict discriminated status: bounded pending metadata or the exact completed explanation.
- Scope the lookup to user, plan and key. Foreign, wrong-plan and absent keys are concealed as not found. The response is `private, no-store, max-age=0`.
- The read never contacts the worker or creates consent, plan or health records. If the exact row is already past its durable deadline, it may atomically complete that row with the prevalidated deterministic recovery content described by ADR-0023.
- Week Fold stores only plan ID/revision and the original key in page memory. It does not persist consent, prompts, explanation output, provider requests or replay commands.
- After an ambiguous POST, explanation controls are replaced by one foreground read action. `pending` remains unresolved and can be read later. Not found terminates with no success evidence. Completed content is accepted only when its plan ID/revision match the retained request; an old revision never becomes the current note.
- The shared workbench matrix adds `plan_explain` as its twentieth operation with `reconcile_required` authority and `explanation_intent` retention.

## Consequences

Response recovery can identify one run without matching on time, content or plan revision alone and without a duplicate model call. Pending and deterministic fallback lifecycle behavior remains server-owned. The client still cannot recover after a full page/process loss because request keys and consent intentionally remain memory-only; adding persistent sensitive-work queues is outside this decision.

The real browser test lets the fixture worker/API complete and persist one run, aborts only the browser response, then retrieves that same run with one POST and one GET. The additional contract/UI increases H5 total/largest async JavaScript to 2,478,181/198,930 bytes and WeApp total/largest page to 875,764/49,310 bytes. Budgets move narrowly to 2,479,000 H5 total, 876,000 WeApp total and 49,500 WeApp page; H5 entry/async and WeApp vendor ceilings remain 320,000/199,500 and 25,000.
