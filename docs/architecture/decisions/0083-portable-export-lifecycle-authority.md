# ADR-0083: Portable-export side effects require current page authority

Date: 2026-08-05

Status: accepted

## Context

ADR-0078 requires local validation before an export becomes a download or persistent file. The lazy adapter still owned the H5 anchor click and WeApp save internally, however, so the page could unmount or lose accepted custody authority while token acquisition, download, local read or verification was in flight. A late valid artifact could then reach a file location and publish success for a page generation that no longer had authority.

The correction must retain one explicit user action, existing artifact verification, 401 session recovery and cross-platform compilation. It must not persist sensitive content/path/request intent, add background replay or misstate best-effort WeApp cleanup as proven physical deletion.

## Decision

- Assign each page export action a monotonic generation and require matching generation, mounted component and current custody authority through one dependency-free predicate.
- Invalidate the active generation on privacy-page unmount, current-overview refresh, revocation-recovery entry, account-erasure start and logout. Clear busy state but do not restart later.
- Pass a `canCommit` callback into the dynamically imported adapter. Check it before token/network work, after receiving and reading the temporary artifact, after deterministic validation and immediately before the platform file side effect.
- On stale H5 work, revoke any Blob URL and do not create/click an anchor. On WeApp, check before `saveFile`; if save completes as authority ends and returns a saved path, attempt `removeSavedFile` before rejecting.
- Let the page publish downloaded choice, schema/size feedback, error or final busy cleanup only for the same current generation. A lifecycle rejection is silent because it is not a valid export result.
- Keep artifact content, account UUID, local path and retry intent out of React state, application storage and logs. Preserve real-device WeApp file-system behavior as an external release gate.

## Consequences

A complete export response released after H5 navigation produces no download and its temporary Blob URL is released. If revocation response loss freezes custody authority, the active H5 transfer is cancelled by the runtime or rejected by the adapter and cannot publish success; exact current-overview reconciliation enables only a later explicit action. The best-effort WeApp post-save removal narrows the race but cannot prove physical deletion when the platform removal API itself fails, so no stronger claim is made.

One model test covers generation/mount/authority predicates. The three export browser scenarios pass together 3/3; the new race covers unmount, custody freeze, reconciliation and two fresh successful downloads. Main browser validation grows to 94/94 and OIDC remains 3/3, for 97 browser tests; unit validation grows to 409 tests. H5/WeApp measure 2,804,141/1,067,717 bytes. Only the WeApp total budget moves from 1,067,000 to 1,070,000 bytes; H5 total, entry, async, vendor and page gates remain unchanged.

## References

- [ADR-0011](0011-user-owned-export-and-erasure.md)
- [ADR-0059](0059-privacy-custody-read-authority.md)
- [ADR-0077](0077-optional-consent-revocation-response-loss-recovery.md)
- [ADR-0078](0078-portable-export-client-artifact-validation.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Iteration 088 archive](../../iterations/088-portable-export-lifecycle-authority.md)
