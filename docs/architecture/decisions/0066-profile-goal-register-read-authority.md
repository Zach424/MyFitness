# ADR-0066: Profile/goal register read authority

Date: 2026-08-05

Status: accepted

## Context

The onboarding editor initialized a complete-looking adult profile and goal draft before `GET /me/onboarding` completed. A non-404 failure then ended loading and exposed those defaults with save enabled and no accepted `expectedRevision`. The API transaction still rejected an overwrite when a profile already existed, but the client could misrepresent unknown sensitive settings as a confirmed new-account starting point. It also had no foreground refresh, retained-revision label or explicit policy for local edits when another client advanced the profile revision.

## Decision

- Represent the register authority as three distinct values: unread, confirmed absent and an accepted `OnboardingResponse`. Only a successful response or the API's explicit 404/new-user result may leave unread.
- Apply initial-loading, ready, refreshing, initial-error and stale phases plus product-owned offline, refusal, service and unknown copy. An initial failure hides the three-step form and never publishes defaults, progress or save.
- Label a confirmed absence before displaying starter choices and state that those choices are an unsubmitted draft, not owner facts.
- Keep the last accepted response and any local edits only in page memory during foreground refresh. A failed refresh labels the retained revision/absence and freezes PUT while draft editing, step navigation and back remain local and usable.
- Track the draft's base revision separately from the latest accepted response. A successful refresh may preserve local input only when that exact base is still current. If the revision changed, do not rebase or overwrite either side; freeze save and require an explicit discard-and-load-latest action.
- Keep server optimistic concurrency authoritative. A 409 triggers one read-only reconciliation, never an automatic PUT retry. The local draft remains present while the newly accepted revision is shown.
- Guard refreshes against overlap, ignore results after unmount and move H5 focus to the stable back action, retry or explicit conflict-resolution action as appropriate.
- Do not persist the profile draft, server response, request or retry command; do not poll, synchronize in the background or replay a save.

## Consequences

Transport and service failures can no longer become editable default personal data, and a retained profile revision cannot authorize an update until current authority returns. Confirmed first-time setup remains available, while multi-client revision drift becomes an explicit user choice rather than a silent rebase. The API and database contracts do not change.

The page-only state and styles raise measured H5/WeApp totals to 2,704,938/988,146 bytes. H5 entry/largest async JavaScript remain 319,235/207,097 bytes; WeApp vendor/largest page remain 18,915/55,523 bytes.

## References

- [ADR-0003](0003-identity-onboarding-boundary.md)
- [Identity and onboarding model](../IDENTITY_PROFILE_MODEL.md)
- [ADR-0031](0031-server-projected-plan-freshness.md)
- [ADR-0057](0057-today-read-snapshot-authority.md)
