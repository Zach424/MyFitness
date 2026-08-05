# ADR-0054: Plan-workout association recovery reads the active projection

Date: 2026-08-05

Status: accepted

## Context

An explicit plan-to-workout link is user-owned evidence, not inferred adherence. Creation binds one plan ID/revision/session date to one workout ID/revision. The service transaction already returns an existing active row for the complete same tuple and rejects competing session/workout links. Unlink has a different authority: it closes one active link at an expected link revision, increments that revision and retains a closure reason/history that the active client projection does not expose.

If a browser response disappears after either transaction commits, a generic error invites duplicate interaction and hides what is currently linked. Blind unlink replay is unsafe and will return `404`; blindly repeating create is tuple-safe but can still conceal a concurrent relationship state. The client needs one visible policy that preserves the user's exact association intent without inferring completion or inventing a closure cause.

## Decision

Both `plan_link` and `plan_unlink` use `reconcile_required` after an ambiguous network, retryable service or unexpected adapter failure. Explicit non-retryable server refusal terminates the current attempt.

| Operation    | Retained page evidence                                    | Successful current-state match                      | Prohibited behavior                                                  |
| ------------ | --------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Create link  | Plan ID/revision, session date, workout ID/bound revision | One active link matches all five fields             | Blind/background create, partial match, inferred adherence/migration |
| Close/unlink | Plan ID, link ID/revision and session date                | Target link ID is absent from the active projection | Delete replay, claiming user closure reason, deleting source records |

- The authenticated `GET /plans/weekly` projection is the client read boundary. It exposes every active link attached to the latest twelve owner plans together with the plan's current content, revision and freshness.
- Create recovery accepts only the complete tuple. A same session linked to another workout or the same workout linked elsewhere is a visible conflict and is never overwritten. If no exact/conflicting active link appears, the interrupted attempt ends with no success evidence; a new user selection is required.
- Unlink recovery treats target absence as the intended active-state outcome only. It cannot distinguish explicit user unlink from workout deletion or another closure path because closure metadata belongs to export/audit history, not the active projection. Copy preserves that uncertainty.
- Reconciliation loads the current plan projection and returns to the intended session date. An old plan-revision link is not migrated to a current revision.
- Link intent lives only in page memory and remains visible in the recovery strip. During uncertainty, dates, workout choices, link/unlink, plan refresh, substitutions and decisions reject pointer, Enter and Space callbacks and expose `aria-disabled`.
- No association request is stored, queued or replayed in the background. Neither successful link nor closure changes the plan/workout aggregate or creates a score.

## Consequences

Users can recover a committed-but-unread relationship without duplicate rows and can see exactly which relationship is under review. The active projection intentionally cannot prove a closure reason; that narrow wording prevents an absence from being presented as user action or source deletion.

One real-service browser scenario lets the API/PostgreSQL return 201 for create and 200 for unlink, aborts both responses, then reads one exact link and later its absence. Request counters remain one create and one delete. Existing normal link/unlink, immutable plan history, Today projection and export/integration behavior remain green.

The added Week Fold logic increases H5 total/largest async JavaScript to 2,473,823/198,901 bytes and WeApp total/largest page to 870,189/45,091 bytes. H5 entry and WeApp vendor remain 318,996 and 18,915 bytes. Budgets move narrowly to 2,474,500/199,500 H5 and 871,000/45,500 WeApp while unrelated entry/vendor ceilings stay fixed.
