# ADR-0076: Profile/goal response-loss recovery

Date: 2026-08-05

Status: accepted

## Context

The adult onboarding register already distinguishes unread, confirmed absence and accepted current profile authority. Existing-profile PUT uses an expected revision, and a known 409 performs one GET before the user can explicitly discard/reload local input. A transport interruption was different: the generic catch displayed the adapter message and left save available. If the transaction had committed, another click sent an old-revision PUT before reading evidence. Optimistic concurrency prevented overwrite but made conflict the first recovery mechanism.

The transaction changes profile, goal, eligibility inputs and purpose/version consents together. Revision movement alone cannot prove that the current safety or consent facts came from the submitted request, and the client must not silently rebase local input onto another writer's revision. Unlike record editors, this page deliberately has no persistent sensitive-draft vault.

## Decision

- Add one dependency-free onboarding recovery module for failure authority and exact current-response evidence.
- Network, retryable service and unknown adapter outcomes require reconciliation. Explicit non-retryable refusal terminates the attempt; known 409 retains its existing conflict-read path.
- Freeze the nullable base revision and exact validated `OnboardingRequest` in React page memory. Lock text, choice and consent controls from request start through reconciliation so the visible input remains the submitted input.
- Replace the regular save action with one exact `GET /me/onboarding`. Never issue PUT from reconciliation.
- For an existing profile, accept completion only when the current revision advanced beyond the base and every response-visible submitted fact matches. For confirmed absence, require the created revision and the same complete match.
- Compare display profile values/timezone/unit, complete goal and ordered constraint arrays, risk flags, and the active versions for terms, privacy and health-data consent. Exclude canonical height, eligibility status, timestamps and identifiers because they are server-derived rather than submitted facts.
- If the same revision remains, or a no-profile base remains absent, preserve input, clear recovery and require a later explicit save. If evidence is older, missing unexpectedly, advanced but different or otherwise divergent, accept the new read authority while preserving input under the existing explicit discard/load-current flow.
- A failed reconciliation read retains the same action. Add no API, schema, database, polling, automatic/background replay, persistent profile draft or request queue.

## Consequences

An ambiguous profile write no longer invites a blind PUT or treats revision movement as proof of risk/consent content. Input stays visible but non-interactive while its exact submission is checked, and divergent current evidence reuses the established no-silent-rebase decision instead of creating another conflict model.

Six unit cases cover failure authority, complete response projection and first/advanced/same/divergent evidence. A real-service browser test commits v1→v2 before aborting only the browser response and confirms it with one PUT; a second PUT aborts before commit, exact GET proves v2, and v3 is created only by a later explicit save. The existing offline/stale/409 cases and full main browser suite pass 87/87; OIDC passes 3/3.

Measured H5 total grows from 2,808,130 to 2,815,911 bytes and WeApp from 1,034,512 to 1,043,387. Only total ceilings move to 2,818,000 and 1,045,000; H5 entry/largest async remain within 320,000/208,000 and WeApp vendor/largest page remain within 25,000/56,100.

Optional-consent revocation remains the next local response-loss gap. Current privacy-overview authority can prove whether a purpose is inactive, but it cannot reconstruct cleanup counts and must not overstate them.

## References

- [ADR-0003](0003-identity-onboarding-boundary.md)
- [ADR-0066](0066-profile-goal-register-read-authority.md)
- [ADR-0074](0074-aggregate-correction-response-loss-recovery.md)
- [Identity/profile model](../IDENTITY_PROFILE_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
