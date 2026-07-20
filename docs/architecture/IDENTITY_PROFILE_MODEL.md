# Identity and onboarding model

Status: verified WeChat and H5 OIDC server adapters plus erased-identity suppression are implemented locally; real credentials/device/browser callback and shared-provider proof remain gated

## Ownership chain

```text
provider subject → auth_identity → user ← auth_session token hash
                                    ├─ user_profile (revisioned)
                                    ├─ user_goal
                                    ├─ consent_event (append-only)
                                    └─ health_record
```

Clients never provide a user ID to protected resource routes. A guard hashes the opaque Bearer token, verifies expiry, resolves the owning user, and injects that principal into the request. The raw token exists only in the client response/storage; PostgreSQL stores a 64-character SHA-256 value.

## Tables and invariants

| Table                        | Purpose                               | Important invariants                                                                        |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `users`                      | Stable product identity               | UUID primary key; lifecycle timestamps                                                      |
| `auth_identities`            | Replaceable provider subject mapping  | Unique provider + subject; cascades with user                                               |
| `auth_sessions`              | Revocable opaque session lookup       | Unique token hash; explicit provider; expiry required; last-used timestamp                  |
| `auth_identity_suppressions` | Deleted-identity recreation guard     | Provider + HMAC subject reference only; no raw provider subject or user ID                  |
| `user_profiles`              | Adult baseline and safety eligibility | Adult confirmation required; canonical height 100–250 cm; revision starts at 1              |
| `user_goals`                 | Current planning constraints          | Enumerated goal/experience; 1–7 unique weekdays; 15–180 minutes; non-empty equipment        |
| `consent_events`             | Purpose/version lifecycle receipts    | Append acceptance rows; withdrawal timestamps the active interval; renewed grant adds a row |

Risk flags are a bounded enum. No flags produces `eligible`; one or more produces `professional_clearance_required`. This status controls future plan generation, not the ability to own or export records, and must not be presented as a diagnosis.

## Update behavior

Profile and goal changes run in one database transaction. The service locks the current profile and compares `expectedRevision`; a stale client receives a conflict rather than overwriting newer data. Height is converted to canonical centimeters while its chosen display value/unit are retained. Consent writes use append-only events, so a profile revision cannot rewrite when or which policy version was accepted.

The current versions are `2026-07-18` for terms, privacy and health-data processing. A client must send the exact active versions. Required service purposes remain active until account erasure. Optional AI-plan and food-photo purposes can be withdrawn; a later explicit request adds a new acceptance row rather than clearing the prior revocation. The privacy center exports every interval and erases consent receipts with the account.

## Environment boundary

`POST /v1/auth/dev/session` remains a repeatable local adapter. It is hidden when `NODE_ENV=production` or `dev` is absent from `AUTH_ENABLED_PROVIDERS`.

`POST /v1/auth/wechat/session` accepts only a bounded short-lived code. The API calls WeChat `code2Session` over the pinned official production endpoint, validates `openid`, namespaces it as `<AppID>:<openid>`, and issues a seven-day `mf_user_*` token. The client cannot submit an `openid`; `session_key` is never persisted or logged. `auth_sessions.provider` is returned by authentication instead of being inferred as `dev`.

`GET /v1/auth/oidc/config` returns only browser-safe issuer, authorization URL, client ID, exact callback and `openid` scope. `POST /v1/auth/oidc/session` accepts an authorization code, RFC 7636 verifier, transaction nonce and that exact callback. The API exchanges the code at the server-only token endpoint and verifies ID Token signature/JWKS, algorithm allow-list, exact issuer, client-ID audience/authorized party, ten-minute age, expiry and nonce before issuing the same opaque product session. A configured client secret uses HTTP Basic and never enters public configuration.

OIDC identities store `oidc:SHA-256(issuer || NUL || subject)`, not the original subject or upstream access/ID token. This value is stable and unambiguous for identity equality while reducing directly identifying provider residue. Account linking is intentionally absent: WeChat and OIDC identities create separate users even when provider profile fields appear to match.

The production Mini Program build uses `TARO_APP_AUTH_MODE=wechat`, calls `Taro.login`, and requires an HTTPS API URL. The H5 server boundary is ready, but the current H5 artifact remains `dev / preview-only` until the client adds state/nonce/PKCE S256 generation, tab-scoped transaction storage, exact callback handling and an `oidc / candidate` release contract.

When account erasure begins, the account is no longer active. Before the user graph is deleted, each provider subject becomes a domain-separated `HMAC-SHA256(ERASURE_LEDGER_HASH_SECRET, provider, subject)` reference in the external v2 ledger and `auth_identity_suppressions`. A future login with the same verified identity receives `403` instead of silently creating a new user. Restore replay recreates suppressions before opening traffic; legacy v1 entries derive identity references from the isolated restored rows. The current MVP has no re-registration override, which is an explicit product/legal gate rather than a support-side database edit.
