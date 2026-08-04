# ADR-0040: Recoverable, owner-scoped sensitive local drafts

Date: 2026-08-05

Status: accepted

## Context

The workout, meal and health-record editors held unfinished input only in React state. A refresh, process restart or short client crash silently discarded that work. Persisting entire page state would create a second, weakly governed copy of health data and could accidentally retain photo paths, authorization material, account-erasure secrets or review-only AI candidates.

The client must work in both H5 and WeChat Mini Program, where platform application storage is available but its device-security and shared-device guarantees differ. The server remains authoritative for saved records; a local draft is only an expiring recovery aid.

## Decision

1. Use one dependency-free `myfitness-sensitive-draft/v1` envelope for the three create editors: `workout`, `meal` and `health-record`. The envelope stores contract/version, exact kind, owner scope, save/expiry instants and a whitelisted payload.
2. Expire every draft after 24 hours and bound each serialized envelope to 96 KiB. Missing, malformed, oversized, expired, wrong-version, wrong-kind and cross-owner envelopes are rejected and removed before any form receives them.
3. Scope drafts to the verified session `userId`; the production-disabled development path may fall back to its random local subject. If neither scope is available, do not persist or restore a draft.
4. Validate structural schemas before write and restore. Incomplete numeric strings remain valid draft input, but unknown fields, unknown metrics/units and unbounded nested collections do not.
5. Persist only create-form fields. Do not persist raw photo bytes/paths, authorization codes/tokens, account-erasure intents/receipts, page request state or unconfirmed AI proposal objects. A meal item explicitly confirmed from the photo flow is only the resulting catalog-bound food snapshot; the candidate sheet itself is excluded.
6. Autosave meaningful changes after a 600 ms quiet period. On the next page load, show saved-at and expiry metadata and require an explicit Restore or Discard choice; never silently replace the current form.
7. Clear the relevant draft after a successful create/update, explicit cancel or discard. Clear all three kinds before logout and at account-erasure intent initiation. Receipt storage remains deliberately separate so ambiguous erasure completion can still be recovered.
8. Keep correction drafts out of this first slice. Existing saved records remain recoverable on the server and corrections retain optimistic revision checks; the local vault protects unsaved new-entry work only.

## Consequences

Short interruptions no longer erase meaningful new-record input, while stale or foreign-account data cannot silently reappear. The visible ticket makes local retention and automatic deletion concrete. Server records, exports and revision history remain unchanged; no database migration or new provider is required.

Application storage is not claimed to be encrypted or equivalent to a secure enclave. Production shared-device behavior, Mini Program platform retention and device-compromise handling remain review gates. Users can remove the draft immediately, and logout/erasure initiation clears it conservatively.

The final implementation measures 2,259,296 H5 bytes and 755,870 WeApp bytes. Reviewed total-tree ceilings move to 2.28 MB and 770 KB; the existing 320 KB H5 entry, 200 KB asynchronous JavaScript, 25 KB WeApp vendor and 45 KB page-JavaScript limits remain unchanged.

## Alternatives rejected

- Persist the entire page state: would capture photos, AI review state, request keys and unrelated UI state.
- Restore automatically: could overwrite a newer form or surprise a shared-device user.
- Use one anonymous draft: permits cross-account disclosure after account switching.
- Store drafts server-side: adds durable sensitive state, synchronization and erasure/export scope without measured need.
- Encrypt with an application-embedded key: adds complexity without protecting against a compromised client that holds the same key.
- Keep drafts indefinitely: conflicts with data minimization and makes forgotten shared-device data more likely.
