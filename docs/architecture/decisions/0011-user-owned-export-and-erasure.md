# ADR-0011: User-owned export, revocable optional consent and primary-store erasure

Date: 2026-07-19

Status: accepted

## Context

The product already stores sensitive health history, AI provenance and short-lived food photos, but an authenticated user could not inventory, export or erase that graph. The original consent uniqueness also prevented a truthful accept–withdraw–accept-again history, and flat private-photo keys made account-wide orphan cleanup weak across filesystem/database boundaries.

## Decision

- Add one authenticated privacy ownership surface for inventory, versioned JSON export, optional-consent withdrawal and account erasure.
- Keep required service consent separate from optional AI/photo consent; only the latter has an independent withdrawal control.
- Allow multiple consent rows per purpose/version so every renewed explicit grant follows the prior revoked interval instead of rewriting it.
- Generate a repeatable-read `myfitness-portable-export-v1` attachment, include retained sanitized media, and exclude authentication/security internals.
- Store new private photos below a validated user UUID directory while retaining exact-key compatibility for pre-iteration files.
- Mark an account `deletion_pending`, purge private media, then delete its cascaded database graph and write an unlinkable `primary-store-v1` receipt in one transaction.
- Keep the client on a deletion-complete page without silently issuing a new development identity.

## Consequences

Users can now take their record history, stop optional processing and erase the locally implemented primary store. Retried AI/photo requests create no duplicate consent event for the same idempotency key, while a new explicit request after withdrawal creates a new active event. Account deletion invalidates sessions naturally through the user cascade and a concurrent pre-authenticated photo upload cannot leave a file outside the removable user directory.

The JSON export is synchronous and base64 media increases size; a production archive job will require encrypted object delivery, quotas and expiry. The receipt intentionally contains no account link, so later administrator verification needs a tightly controlled support workflow. `primary-store-v1` does not claim deletion from backups, logs or provider systems; those remain release gates rather than implied guarantees.
