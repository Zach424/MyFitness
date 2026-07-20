# User identity operations runbook

Status: WeChat and H5 OIDC server exchanges, provider-bound sessions and erased-identity suppression are proven against local provider doubles; real Mini Program credentials, browser callback, identity tenant, domains and device/shared-environment evidence remain gated

## Trust boundary

Neither client is an identity authority.

- WeApp obtains a short-lived code from `Taro.login` and sends only that code to `POST /v1/auth/wechat/session`. The API calls WeChat `code2Session`, validates `openid`, discards `session_key`, and issues an opaque `mf_user_*` token.
- H5 reads the browser-safe values from `GET /v1/auth/oidc/config`. The browser must create transaction-specific state, nonce and PKCE verifier, redirect with `code_challenge_method=S256`, validate state on the exact callback, and send only code, original verifier, nonce and exact callback to `POST /v1/auth/oidc/session`. The API exchanges the code and verifies the signed ID Token before issuing the same opaque product token.

PostgreSQL stores application-token SHA-256 hashes and explicit providers. OIDC identity rows store a one-way issuer/subject digest; WeChat identities store the AppID-namespaced openid. Never accept `openid`, OIDC subject, issuer, audience, user ID or session provider from a client. Never put authorization codes, verifiers, nonces, AppSecret, OIDC client secret, provider tokens/responses or raw subjects in logs, metrics, traces, support views or browser-visible configuration.

## Configuration

WeChat production requirements:

```dotenv
NODE_ENV=production
AUTH_ENABLED_PROVIDERS=wechat
WECHAT_MINI_APP_ID=wx...
WECHAT_MINI_APP_SECRET=<secret-manager-reference>
```

H5 OIDC production requirements:

```dotenv
NODE_ENV=production
AUTH_ENABLED_PROVIDERS=oidc
USER_OIDC_ISSUER=https://identity.example.com
USER_OIDC_AUTHORIZATION_URL=https://identity.example.com/oauth2/authorize
USER_OIDC_TOKEN_URL=https://identity.example.com/oauth2/token
USER_OIDC_JWKS_URL=https://identity.example.com/.well-known/jwks.json
USER_OIDC_CLIENT_ID=myfitness-h5
USER_OIDC_CLIENT_SECRET=<optional-secret-manager-reference>
USER_OIDC_REDIRECT_URI=https://h5.example.com/auth/callback
```

Use `AUTH_ENABLED_PROVIDERS=wechat,oidc` when both release clients share the API. Production forbids `dev`; all user OIDC URLs must use HTTPS and contain no embedded credentials, query or fragment. Register the callback as an exact URI at the provider. The optional client secret is an API workload secret, never an H5/CI build variable. The browser-facing config route deliberately omits token/JWKS URLs and the secret.

Production pins `WECHAT_CODE_SESSION_URL` to `https://api.weixin.qq.com/sns/jscode2session`; an override is accepted only outside production for deterministic integration tests.

Mini Program release build:

```powershell
$env:TARO_APP_AUTH_MODE = 'wechat'
$env:TARO_APP_API_BASE_URL = 'https://api.example.com/v1'
pnpm build:weapp
```

The H5 release command remains intentionally unavailable in this iteration: its current release manifest is `dev / preview-only`. Do not expose H5 until the next client iteration implements and verifies state, nonce, S256, callback cleanup and the `oidc / candidate` artifact contract.

## Shared-environment preflight

1. Name business/technical owners for the real Mini Program and end-user OIDC tenant/client. Record provider region, retention, incident, account-recovery and availability policy.
2. Put WeChat AppSecret and any OIDC client secret in the secret manager. Restrict reads to the API workload identity and define rotation/emergency revocation owners.
3. Register only the exact H5 HTTPS callback. Add the exact HTTPS API origin to WeChat request-domain allow-list and API CORS. Verify DNS, certificate chain, WAF/proxy path and `TRUST_PROXY_HOPS`.
4. Require Authorization Code flow, PKCE S256, signed ID Tokens and an approved RS256/PS256/ES256 key. Disable implicit/password flows for this client. Confirm JWKS rotation retains overlapping keys long enough for in-flight exchanges.
5. Apply all checksum-verified migrations, including 0015 and 0019. Confirm provider constraints include `oidc` and suppression rows accept it.
6. Start the API with the intended provider list. Confirm `POST /v1/auth/dev/session` returns `404`; confirm OIDC public config exactly matches the registered issuer/client/callback and contains no token endpoint, JWKS URL or secret.
7. Exercise first/repeat login for each client on real devices/browsers. Prove the same provider identity resolves one user, cross-provider identities are not auto-linked, protected data remains owner-scoped, invalid/expired/replayed codes and nonce/state/verifier mismatches fail, and callback parameters disappear from browser history.
8. Inspect application/database/telemetry evidence. Confirm no provider code, verifier, nonce, secret, raw OIDC subject, upstream access/ID token, WeChat `session_key` or unintended `openid` is present.
9. Exercise account deletion for both providers. Confirm immediate access closure, completed receipt, raw identity removal, one HMAC suppression and later `403` without a replacement user.
10. Run `pnpm ops:verify-backup-restore` against the approved isolated restore path and retain identity, erasure and deployment proof together.

## Incidents and rotation

- Provider unavailable, JWKS unavailable or malformed response: return a generic `503`, create no user, and alert only on aggregate failure class/rate.
- Invalid/expired code, bad ID Token or nonce mismatch: return generic `401`. Exact callback/contract violations return `400`. Verified session attempts are bounded at 30/minute per normalized IP in addition to ingress limits.
- Unexpected issuer/audience/algorithm/key: hold OIDC issuance. Do not broaden allow-lists or skip verification to restore availability.
- Suspected AppSecret/OIDC client-secret compromise: hold that adapter, rotate provider and secret-manager values, restart workloads, verify exchange, and review aggregate evidence. Existing opaque application sessions are independent; revoke them only when incident scope requires it.
- JWKS rotation outage: confirm the configured URL and provider overlap policy. Never pin an ad hoc public key or accept unsigned tokens during recovery.
- Erased identity: `403` is expected. Do not remove/bypass suppression through support tooling. Fresh-account re-registration needs separate product/legal approval and explicit consent.
- `ERASURE_LEDGER_HASH_SECRET` loss/rotation: keep traffic closed on restored data. Implement and exercise versioned dual-read/dual-write before planned rotation.

## Rollback

Migrations 0015 and 0019 remain applied after provider sessions or suppressions exist. Remove a failing adapter from `AUTH_ENABLED_PROVIDERS` and hold its login/client traffic. An older API may not safely understand OIDC sessions or v2 erasure semantics, so retain a compatible erasure worker/reconciler. Never re-enable `dev`, reactivate a deletion-pending user, remove a suppression, restore a raw subject or weaken token verification to make rollback appear healthy.

## Primary references

- [Taro `login` API](https://docs.taro.zone/en/docs/apis/open-api/login/)
- [WeChat Mini Program login flow](https://developers.weixin.qq.com/miniprogram/en/dev/framework/open-ability/login.html)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [ADR-0016](../architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
- [ADR-0027](../architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
