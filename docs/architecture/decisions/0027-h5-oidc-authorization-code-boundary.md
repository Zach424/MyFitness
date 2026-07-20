# ADR-0027: Terminate H5 OIDC Authorization Code + PKCE at the API

Date: 2026-07-20

Status: Accepted for the H5 user-identity server boundary; browser callback and managed-provider proof remain pending

## Context

The H5 build still uses the production-disabled development issuer. Reusing the Mini Program `Taro.login` adapter is impossible outside WeChat, while accepting an OIDC subject or ID Token without a bound authorization transaction would let an untrusted browser assert account ownership or replay identity material.

H5 is a public browser client and cannot keep a client secret. OAuth 2.0 Security Best Current Practice requires redirect-based clients to bind authorization codes to the initiating client instance, recommends PKCE for all client types, and requires exact redirect-URI matching. OpenID Connect adds a signed ID Token and transaction-specific nonce. The existing provider-neutral identity/session and erased-identity suppression paths can terminate a new adapter without changing protected business routes.

## Decision

1. Add provider `oidc` to shared contracts and all three database provider constraints. `GET /v1/auth/oidc/config` publishes only issuer, authorization endpoint, client ID, exact redirect URI and the fixed `openid` scope.
2. The browser will create high-entropy state, nonce and PKCE verifier values, use `S256`, retain transaction values only in tab-scoped session storage, and submit the returned authorization code, original verifier, nonce and exact redirect URI to `POST /v1/auth/oidc/session`. The browser callback is the next iteration and is not claimed by this decision's implementation evidence.
3. The API alone calls the configured token endpoint. A configured client secret uses `client_secret_basic` and never appears in public configuration; a provider registered as a public client receives `client_id` in the form body. Token, JWKS and secret settings remain server-only.
4. Before issuing an application session, the API verifies the ID Token through remote JWKS with an explicit RS256/PS256/ES256 allow-list, exact issuer, client-ID audience, ten-minute maximum age, expiry and matching transaction nonce. Multiple audiences additionally require `azp` to equal the configured client ID.
5. The token request requires a 43–128 character RFC 7636 verifier, and the submitted redirect URI must exactly equal the configured callback. Invalid codes or claims return a generic `401`; provider availability/malformed-response failures return a generic `503`. Raw codes, tokens, claims and provider payloads are not logged.
6. The stable provider subject stored in `auth_identities` is `oidc:` plus SHA-256 over the issuer, a NUL separator and the verified subject. The original subject and upstream access/ID tokens are not persisted. The existing advisory lock, opaque seven-day application session, erasure HMAC and suppression check remain authoritative.
7. Production can enable only explicit `wechat` and/or `oidc` adapters; `dev` remains forbidden. Enabling OIDC requires complete TLS-only issuer/authorization/token/JWKS/callback settings and a bounded client ID. The client secret is optional but, when used, must come from managed secret storage.

## Consequences

- A browser cannot select its user ID, OIDC subject, issuer, audience or redirect target.
- Identity-provider credentials and upstream tokens remain outside the H5 artifact and database.
- Account ownership stays provider-neutral and all existing owner guards, deletion behavior and restore suppression apply to OIDC sessions.
- Hashing the verified issuer/subject minimizes directly identifying identity residue but prevents operator inspection or provider-side subject lookup without a separately approved diagnostic mechanism.
- This boundary does not provide account linking between WeChat and OIDC. The same person using both providers receives separate product accounts unless a future explicit, strongly re-authenticated linking design is approved.
- This does not prove the browser redirect/callback implementation, a real provider tenant, DNS/TLS/CORS, hosted JWKS rotation, managed secrets, public H5 delivery or shared login. Those remain release gates.

## Alternatives considered

- Keep H5 on development sessions: rejected because production intentionally hides that issuer.
- Reuse WeChat Mini Program login in H5: rejected because it is runtime-specific and does not establish a general browser identity boundary.
- Accept a browser-supplied subject or unverified ID Token: rejected because account ownership becomes caller-controlled.
- Use the implicit flow or return provider access tokens to application code: rejected because the authorization-code exchange gives a narrower, sender-bound path and the product needs identity, not provider API access.
- Put the client secret in the H5 bundle: rejected because a public browser cannot keep it confidential.
- Persist raw issuer and subject: rejected because an unambiguous one-way digest is sufficient for stable equality and erasure suppression.
- Automatically link WeChat and OIDC by email or display fields: rejected because those claims are not a sufficient cross-provider proof of account ownership.

## Rollback

Migration 0019 only broadens provider constraints and remains applied after any OIDC identity exists. To disable the adapter, remove `oidc` from `AUTH_ENABLED_PROVIDERS` and hold H5 login traffic; existing opaque OIDC application sessions may be revoked according to incident scope. Do not delete OIDC identities, restore raw provider subjects, bypass suppressions or re-enable development auth as a rollback shortcut.

## References

- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [ADR-0016: verified WeChat identity and erasure suppression](0016-verified-wechat-identity-and-erasure-suppression.md)
