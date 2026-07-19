# ADR-0016: Verify WeChat identity server-side and suppress erased identities

Date: 2026-07-19

Status: accepted for the Mini Program release path; real provider/shared deployment and H5 identity remain pending

## Context

Every client build previously created a local subject and called `POST /v1/auth/dev/session`. Production correctly hides that route, so the production Mini Program artifact had no usable identity path. Accepting a client-supplied `openid` would make account ownership forgeable. A second privacy defect appears after account erasure: automatic login could recreate a new user for the same verified provider identity immediately after the original graph was deleted, making the product appear to have retained or resurrected the account.

The first release target is WeChat Mini Program. Taro exposes `login()` only for supported Mini Program runtimes and returns a short-lived code for server exchange. The existing provider-neutral identity/session model can terminate this adapter without changing business controllers.

## Decision

1. Add `POST /v1/auth/wechat/session`. Its strict contract accepts only a bounded code. The server calls WeChat `code2Session`, validates `openid`, namespaces it with AppID and discards `session_key`. It never trusts a client identity field.
2. Enable adapters explicitly with `AUTH_ENABLED_PROVIDERS`. Production forbids `dev`, requires WeChat credentials when enabled, pins the official HTTPS exchange endpoint and limits verified session attempts to 30/minute/IP.
3. Store `provider` on every user session and return that value from authentication. Continue storing only SHA-256 token hashes and issuing seven-day opaque credentials.
4. Build clients with an explicit `dev|wechat` auth mode. WeChat mode is WeApp-only, requires an HTTPS API base, calls `Taro.login`, and uses the common session principal. H5 remains gated rather than pretending Mini Program identity is portable.
5. Add `auth_identity_suppressions(provider, subject_ref)`. `subject_ref` is a domain-separated HMAC of provider and provider subject; raw `openid`, user ID and account content are absent.
6. Upgrade new erasure ledger objects to `durable-erasure-ledger-v2` with identity references. Account erasure publishes the external control, writes suppressions and deletes the user in the final database transaction. Login checks suppression under the same provider-subject advisory lock used for identity creation.
7. Restore replay accepts v1 and v2. It recreates v2 suppressions before deleting resurrected users. For v1, it derives provider references from identities visible only in the isolated restored database, preserving the new invariant for older ledger entries.

## Consequences

- A Mini Program code, not an `openid`, crosses the untrusted client boundary. Provider session secrets do not become database or observability residue.
- Existing ownership guards and all business routes remain adapter-neutral.
- Concurrent first logins cannot create duplicate identities. A deletion in progress or completed cannot race into a replacement user.
- The WeChat AppSecret and erasure HMAC secret become critical recoverable secrets. HMAC rotation requires a versioned dual-read migration.
- The same erased identity currently cannot create a fresh account. This is safe against silent recreation but needs explicit product/legal approval; any future return flow must collect deliberate fresh-account consent and never relink deleted data.
- This does not prove a real WeChat configuration, domain allow-list, device behavior, shared infrastructure, H5 release identity, account linking or recovery. Those remain release gates.

## Rejected alternatives

- Keep development sessions in production: no verified identity and directly contradicts the existing fail-closed boundary.
- Accept client `openid`: caller-controlled account ownership.
- Persist `session_key`: unnecessary secret retention for the current feature set.
- Use only a user-ID erasure HMAC: removes a restored old user but cannot prevent the verified provider identity from creating a replacement.
- Store raw deleted `openid` as a tombstone: directly linkable deletion residue when an unlinkable keyed reference suffices.
- Auto-create a new account after deletion: indistinguishable from silent resurrection in the current client and bypasses a deliberate new-account decision.

## Rollback

Migration 0015 is additive and stays applied. Hold new identity traffic before rolling back the API. Keep a compatible erasure worker and restore reconciler running until all pending jobs complete. Never remove suppressions, restore raw identities or reactivate deletion-pending users as a rollback shortcut.
