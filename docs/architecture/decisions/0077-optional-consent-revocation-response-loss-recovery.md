# ADR-0077: Optional-consent revocation response-loss recovery

Date: 2026-08-05

Status: accepted

## Context

The privacy custody desk already treats a failed overview refresh as stale read authority, but a transport interruption during revocation previously entered the generic error banner while the old active-consent row and its confirmation remained available. The POST may already have revoked processing and started purpose-specific cleanup, so another confirmation could repeat a destructive operation before current evidence was read.

The existing overview can prove the latest owner-visible authorization state for one purpose. It cannot reconstruct the lost response's `removedPhotoAnalyses` or `removedProgressPhotos`, and an inactive-looking missing/never-granted row is not the expected append-oriented revocation evidence.

## Decision

- Add one dependency-free revocation recovery module for failure authority and current-purpose evidence.
- Network, retryable service and unknown adapter outcomes require reconciliation. Explicit non-retryable refusal terminates the attempt.
- Retain only the exact `RevocableConsentPurpose` and product-owned receipt in React page memory. Close the confirmation and freeze export, every revocation, export-skipping, erasure acknowledgement/input and permanent deletion until resolution.
- Preserve the previously accepted overview as labeled retained evidence. Keep back, profile editing and logout available because they do not consume uncertain custody authority.
- Replace another POST with exactly one explicit `GET /me/privacy`. Accept only that purpose's `revoked` status as applied; treat `active` as not applied and missing/`never_granted` as divergent.
- On applied evidence, state only that current authorization is revoked and explicitly withhold cleanup counts. On active evidence, require a later fresh user confirmation before another POST.
- Accept the complete overview returned by reconciliation. A failed read retains the purpose/receipt for another explicit GET.
- Add no API/schema/database change, polling, automatic/background POST, persistent purpose/request, cleanup-count inference or offline queue.

## Consequences

An ambiguous revocation can no longer trigger blind replay or turn the retained inventory into mutation authority. Current consent evidence and per-request cleanup evidence remain distinct: the overview settles authorization, while only a received POST response can settle cleanup counts.

Four unit cases cover failure authority and revoked/active/divergent evidence. A real-service browser test commits food-photo revocation before aborting only the response, resolves it with one GET and one POST, then aborts AI revocation before commit, resolves current active state with one GET and sends another POST only after a third explicit confirmation. The privacy group passes 7/7, the complete main browser suite 88/88 and OIDC 3/3.

Measured H5 total grows from 2,815,911 to 2,819,656 bytes and WeApp from 1,043,387 to 1,047,834. Only total ceilings move to 2,822,000 and 1,050,000; H5 entry/largest async remain within 320,000/208,000 and WeApp vendor/largest page remain within 25,000/56,100.

Portable-export artifact validation remains the next local custody gap: the client currently marks any successful download status as success without validating the versioned JSON artifact it is about to save.

## References

- [ADR-0011](0011-user-owned-export-and-erasure.md)
- [ADR-0059](0059-privacy-custody-read-authority.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
