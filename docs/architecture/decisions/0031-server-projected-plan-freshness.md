# ADR-0031: Server-projected weekly-plan freshness

Date: 2026-08-04

Status: accepted

## Context

Weekly-plan accept/modify and AI explanation already rechecked the current onboarding revision and professional-clearance eligibility. That protected writes, but the client could continue presenting an old plan as current until a user attempted one of those actions. Persisting a mutable `stale` flag on the plan would duplicate current profile state, invite cache drift and contaminate immutable plan history with a transient read concern.

## Decision

- Keep the stored weekly-plan aggregate and immutable revision snapshots unchanged.
- Attach a server-computed freshness projection only to `GET /plans/weekly` items. Load the current profile once per list request and compare it with each plan's recorded onboarding revision and current eligibility.
- Use an exhaustive state/permission contract: `current` permits accept/modify and AI explanation; `profile_changed`, `eligibility_blocked` and defensive `onboarding_required` do not. Every state permits `skip` and carries one bounded recommended action.
- Do not return risk flags in the projection. The state is sufficient to route the owner to their existing private profile without widening sensitive data in a planning list.
- Refresh the projection on initial client load, page show, visible H5 focus and explicit user request. If authority changes, reset unsaved substitutions and stop showing a prior AI explanation as current.
- Preserve the existing server checks on generation, decisions and AI explanation. The projection improves timing and explanation; it is not authorization.

## Consequences

The user sees revision/eligibility drift before attempting an unsafe or conflicting action, while immutable evidence remains truthful. Alternate or stale clients still fail closed at the server. The list route performs one additional owner-scoped onboarding read and emits a check timestamp; it does not make one profile query per plan. Freshness intentionally does not yet cover new workout, meal or recovery records because `dashboardGeneratedAt` changes on every read and would make all plans appear stale. A future evidence policy requires a stable bounded fingerprint and explicit product semantics.
