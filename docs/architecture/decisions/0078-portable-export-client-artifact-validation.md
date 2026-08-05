# ADR-0078: Portable-export client artifact validation

Date: 2026-08-05

Status: accepted

## Context

The privacy export API already emits a no-store `myfitness-portable-export-v4` JSON attachment from one repeatable-read snapshot. The client previously treated a successful download transport status as sufficient evidence and immediately created an H5 download or invoked Mini Program persistent save. A proxy error page, stale export version, truncated body or incorrect media response could therefore become user-visible success without local artifact evidence.

The artifact contains sensitive health and photo data. Client verification must not create a second persistent copy, log the response, expose account identity in UI state or pull the full schema-validation runtime into ordinary client routes.

## Decision

- Put download/read/save behavior in a privacy-only dynamically imported adapter. Keep the verifier dependency-free and import only the shared export version/media constants.
- Read the H5 temporary Blob or WeApp temporary file before any H5 anchor click or WeApp `saveFile` call.
- Accept only `application/json` with an optional charset, an exact four-key v4 envelope, the exact current export collection-key set, object/array topology, a valid offset generation time, a UUID account identifier and an exact UTF-8 byte length no larger than 50 MiB.
- Reject unreadable, malformed, old-version, wrong-media and oversized artifacts with product-owned messages. Never render or log raw response content.
- Return only schema version, generation time and byte length to the privacy page. Do not return account ID or the parsed data graph.
- Revoke H5 Blob URLs after successful download and on authentication, transport, read or validation failure. A 401 may refresh the existing client session once, but validation failure never retries export automatically.
- Preserve the current privacy-overview authority and erasure preconditions. Artifact rejection changes only export feedback and cannot mark the export choice complete.
- Claim real-browser H5 behavior and dual-platform compilation only. Keep WeApp real-device file-system/save proof as an external release gate.

## Consequences

Transport success can no longer become export success without bounded local evidence, and invalid artifacts do not reach a user download/save location through the application flow. Verification is deliberately an envelope and collection-topology check rather than deep semantic revalidation of every server-owned record row; the trusted API remains responsible for constructing each row from its typed contract.

The dynamic adapter reduces normal H5 total output from 2,819,656 to 2,787,260 bytes despite adding the feature; the largest async JavaScript asset falls from 207,699 to 205,001. WeApp grows from 1,047,834 to 1,052,864 bytes. Budgets become 2,790,000 total and 206,000 largest async for H5, and 1,055,000 total for WeApp; entry, vendor and largest-page limits do not move.

Four unit cases cover the accepted receipt, media rejection, malformed/version/topology rejection and platform-header variants. A real-service browser flow proves that v3 and `text/plain` responses create no download, while the unmodified v4 response creates one verified download. The privacy group passes 8/8, the complete main browser suite 89/89 and OIDC 3/3.

## References

- [ADR-0011](0011-user-owned-export-and-erasure.md)
- [ADR-0059](0059-privacy-custody-read-authority.md)
- [ADR-0077](0077-optional-consent-revocation-response-loss-recovery.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
