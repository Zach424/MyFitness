# ADR-0028: Bind the H5 OIDC browser transaction and candidate artifact

Date: 2026-07-20

Status: Accepted locally; real-provider, hosted-callback and managed-environment proof remain release gates

## Context

ADR-0027 established the server-side Authorization Code + PKCE boundary, but the H5 artifact still used the production-disabled development issuer. A public browser must bind each authorization response to the tab that initiated it, remove the code from visible history promptly, and never turn a deterministic artifact label into a claim of real-provider or public-hosting readiness.

Taro H5 uses hash routing, while an OIDC provider returns query parameters to an exact HTTPS redirect URI. The product therefore needs a small same-origin bridge between the provider callback and the application route. It also needs a release contract that cannot omit that bridge or silently rebuild H5 with development authentication.

## Decision

1. H5 creates independent state and nonce values from 32 random bytes and a PKCE verifier from 64 random bytes. It derives the RFC 7636 `S256` challenge in the browser and keeps the exact issuer, callback, state, nonce, verifier and creation time only in `sessionStorage` for the current tab.
2. The transaction has a strict versioned shape, a ten-minute lifetime and a one-minute future-clock tolerance. Authorization requests use only `response_type=code`, the server-published client/callback, the fixed `openid` scope, state, nonce and `code_challenge_method=S256`.
3. The provider callback is exactly `/auth/callback`. A static HTML page with a restrictive CSP and `no-referrer` policy runs one external script. That script stores only the actual callback origin/path, removes the query from the callback URL, and replaces navigation with the Taro hash login route plus the response query. It never stores the authorization code.
4. The login route immediately removes authorization parameters from browser history before fetching configuration. It requires the exact same-origin callback, the initiating tab transaction, constant-time state equality, an optional exact `iss`, single-valued known parameters and the original callback target. Unknown, duplicate, missing, expired or malformed results fail closed.
5. The transaction and callback target are removed before the one allowed code exchange. A failed exchange is never replayed automatically; the user explicitly starts a new authorization transaction. Provider descriptions are treated as untrusted and are not rendered. Product-owned errors distinguish cancellation, unavailable identity service, invalid/expired transaction and generic connection failure without exposing codes or provider payloads.
6. A release H5 build must use an HTTPS API base and `TARO_APP_AUTH_MODE=oidc`. Its embedded metadata and `myfitness-client-release/v1` record label it `candidate / static-host`. Canonical packaging requires `index.html`, `auth/callback/index.html`, `auth/callback/redirect.js` and the build metadata. H5 callback files are not copied into the WeApp output.
7. Both H5 and WeApp are candidate artifacts, but neither is public-ready. Deployment admission re-verifies both TARs, uploads both only to controlled private preview paths and requires real browser/device identity plus data-custody evidence before delivery. Real OIDC tenant/client policy, exact hosted callback behavior, DNS/TLS/CORS, provider recovery/JWKS rotation and operator approval remain external gates.

## Consequences

- A callback cannot be accepted by a different tab, after expiry, with a changed callback/issuer, or more than once.
- Authorization codes are removed from the callback URL before application network work and are never written to local or session storage.
- The hash-routed application can use an exact conventional OIDC callback without allowing a general inline-script trampoline.
- The deterministic H5 artifact now represents a production-shaped identity mode and includes the callback boundary it depends on.
- `candidate` means structurally admissible for controlled verification. It does not prove a real provider, a static host that preserves the exact callback path, public traffic, legal approval or production data custody.
- A static host that redirects `/auth/callback` to `/auth/callback/`, rewrites it to the SPA entrypoint, changes CSP, or omits the callback files is incompatible and must fail preflight.

## Alternatives considered

- Keep H5 on development identity: rejected because production disables the issuer and a preview label would preserve the deployment blocker.
- Store the authorization code with the transaction: rejected because only state, nonce and verifier need tab persistence; the code should remain transient and be removed from history promptly.
- Use `localStorage`: rejected because authorization transactions must not cross tabs or survive a closed tab.
- Put the callback directly in the Taro hash route: rejected because providers match the URI before the fragment and the fragment is not sent to the server.
- Use inline callback JavaScript: rejected because an external fixed script permits a narrow `script-src 'self'` CSP.
- Retry the same exchange automatically after network failure: rejected because an authorization code is single-use and retry ambiguity can create replays or misleading UI.
- Mark H5 public-ready after provider-double tests: rejected because real tenant, domain, browser, custody and operational evidence are independent requirements.

## Rollback

Hold H5 delivery and remove `oidc` from the affected API environment's enabled provider list if the browser adapter fails. Preserve migration 0019 and existing OIDC identities/suppressions. Do not ship a `dev` H5 release, bypass transaction validation, reuse a consumed code, weaken callback equality, or rewrite an existing immutable release. A corrected browser flow requires a new source commit and release candidate.

## References

- [ADR-0021: immutable client delivery artifacts](0021-immutable-client-delivery-artifacts.md)
- [ADR-0027: H5 OIDC API boundary](0027-h5-oidc-authorization-code-boundary.md)
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
