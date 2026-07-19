# ADR-0022: Recoverable account-erasure receipts

Date: 2026-07-20

Status: accepted

## Context

ADR-0015 closes account access and returns a random receipt UUID plus a one-time status token after the deletion transaction commits. That protects status from receipt-ID enumeration, but the only copy of the token originally crossed the network in the destructive response. If the server committed and the connection failed before the client received that response, the user was correctly signed out while the only recovery credential was lost. Retrying with authentication was impossible because deletion intentionally invalidates the session, and retaining a direct user link on a completed receipt would weaken the erasure boundary.

The recovery protocol must survive ambiguous network completion and a client reload without logging a bearer secret, exposing it in a URL, making a receipt UUID sufficient, reactivating the account or keeping the receipt linked to the deleted subject. It must remain compatible with the existing durable job and restore-ledger semantics.

## Decision

- Require an authenticated, rate-limited `POST /v1/me/privacy/account-deletion-intents` step before deletion. It returns a server-generated UUID plus a 32-byte base64url secret and expires after 15 minutes.
- Store only the secret's SHA-256 hash in PostgreSQL. Allow one active intent per user; creating another atomically rotates the previous intent so an older secret cannot authorize deletion.
- Require both the intent UUID in the strict deletion body and the secret in `X-Erasure-Intent-Token`. Atomically delete one matching, unexpired intent inside the same transaction that closes access and creates the durable erasure receipt/job.
- Reuse the consumed intent secret as the final receipt status credential. The client persists it before sending `DELETE`, so the credential exists even if the destructive response is lost. Raw secrets are never stored server-side or written to application logs.
- Keep the existing receipt-ID status route and add rate-limited, no-store `POST /v1/privacy/erasure-receipts/recover` with `X-Erasure-Receipt-Token`. Recovery hashes the secret, locates one strict durable-v2 receipt and returns only the minimal receipt status; it does not return the secret or user information.
- Persist the pending receipt credential in client application storage across reloads, mask it in the receipt view and provide explicit local removal. A normal deletion response and a recovered response both close local authentication without attempting a generic `401` re-login.
- Keep completed receipts unlinkable from the erased account and preserve the existing erasure-ledger, identity-suppression, provider-disposition and backup-replay behavior.

## Consequences

A committed deletion can now be distinguished from an uncommitted failed request without restoring the account or contacting support. Rotated, expired, already-consumed and random credentials fail closed. The server retains only hashes, while the receipt remains usable after the account session is gone and after the client reloads.

The bearer secret now remains in client application storage until the user removes it or client expiry cleanup applies. Anyone with access to that application storage could read minimal receipt status, so secure platform storage, shared-device behavior and a final retention/expiry policy remain a closed-beta review gate. Secret compromise still does not authorize account access, reveal health content or reconnect a completed receipt to the erased user.

The extra preflight request adds one network round trip and deletion is no longer a single-call API. CORS must explicitly allow the intent header, and browser integration must cover real preflight behavior. The backup/restore drill must advance whenever the migration count advances.

## Alternatives rejected

- **Return a token only in the delete response:** preserves the original ambiguous-commit failure.
- **Retry deletion after automatically signing in again:** conflicts with immediate access closure and may create a different identity after erasure.
- **Use the receipt UUID alone:** makes an identifier an authorization credential and increases enumeration impact.
- **Put the secret in a query parameter:** leaks through browser history, proxy logs, analytics and referrers.
- **Store the raw secret in PostgreSQL:** turns a database disclosure into immediate receipt access without adding recovery value.
- **Let every client generate its own secret:** makes entropy and encoding enforcement platform-dependent; server generation provides one strict contract.
- **Retain a user-to-receipt link for authenticated lookup:** cannot work after session closure and weakens completed-subject unlinkability.

## References

- [ADR-0015](0015-durable-data-erasure-and-restore-ledger.md)
- [Data custody operations runbook](../../operations/DATA_CUSTODY_RUNBOOK.md)
- [Privacy ownership model](../PRIVACY_OWNERSHIP_MODEL.md)
