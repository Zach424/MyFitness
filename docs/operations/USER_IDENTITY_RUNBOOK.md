# User identity operations runbook

Status: WeChat code exchange, provider-bound sessions and erased-identity suppression are proven against a local HTTP provider double; real Mini Program credentials, domain configuration and device evidence remain gated

## Trust boundary

The Mini Program is not an identity authority. It obtains a short-lived code from `Taro.login` and sends only that code to `POST /v1/auth/wechat/session`. The API calls the WeChat `code2Session` endpoint with the server-held AppID and secret, validates the returned `openid`, discards `session_key`, and issues an opaque `mf_user_*` token. PostgreSQL stores the token SHA-256 hash and explicit provider.

Never accept `openid`, `unionid`, `session_key`, user ID or session provider from the client. Never place the Mini Program secret, provider response or code-exchange URL in application logs, metrics, traces or support views.

## Configuration

API production requirements:

```dotenv
NODE_ENV=production
AUTH_ENABLED_PROVIDERS=wechat
WECHAT_MINI_APP_ID=wx...
WECHAT_MINI_APP_SECRET=<secret-manager-reference>
```

Production pins `WECHAT_CODE_SESSION_URL` to `https://api.weixin.qq.com/sns/jscode2session`; an override is accepted only outside production for deterministic integration tests. `AUTH_ENABLED_PROVIDERS` must not contain `dev` in production. The AppSecret belongs in the deployment secret manager, not a committed env file, client build, CI log or operator browser.

Mini Program release build:

```powershell
$env:TARO_APP_AUTH_MODE = 'wechat'
$env:TARO_APP_API_BASE_URL = 'https://api.example.com/v1'
pnpm build:weapp
```

The build rejects WeChat auth for non-WeApp targets and rejects a non-HTTPS API URL. H5 must not deploy with `dev` against a production API; it needs a separate verified adapter before release.

## Shared-environment preflight

1. Create or select the real Mini Program and record its named business/technical owner.
2. Put AppID and AppSecret in the secret manager and restrict read access to the API workload identity. Define a rotation owner and emergency revocation path.
3. Add the exact HTTPS API origin to the Mini Program request-domain allow-list. Verify certificate chain, DNS, WAF/proxy path and `TRUST_PROXY_HOPS`.
4. Apply all checksum-verified migrations. Confirm `auth_sessions.provider` and `auth_identity_suppressions` exist.
5. Start the API with `AUTH_ENABLED_PROVIDERS=wechat`. Confirm `POST /v1/auth/dev/session` returns `404`.
6. On a real device, prove first login returns a new user, a later code resolves the same user, protected data remains owner-scoped, expired/invalid codes fail, and logs contain no code, secret, `openid` or `session_key`.
7. Exercise account deletion. Confirm the session closes immediately, the receipt completes, the raw identity disappears, one HMAC suppression remains, and a later code for the same identity returns `403` without creating a user.
8. Run `pnpm ops:verify-backup-restore` against the approved isolated restore path and retain the proof with deployment evidence.

## Incidents and rotation

- Provider unavailable or malformed response: return a generic `503`, do not create a user, and alert on aggregate failure rate without recording codes or provider payloads.
- Invalid/expired code: return `401`; repeated attempts are bounded at 30 requests/minute per normalized IP in addition to the ingress gate.
- Erased identity: `403` is an expected privacy control. Do not delete or bypass the suppression through support tooling. The MVP has no re-registration override; product/legal approval and an explicit fresh-account consent design are required before adding one.
- Suspected AppSecret compromise: stop new identity issuance or hold traffic, rotate at the provider and secret manager, restart workloads, verify code exchange, and review aggregate/audit evidence. Existing opaque application sessions are independent; revoke them only when the incident scope requires it.
- `ERASURE_LEDGER_HASH_SECRET` loss/rotation: keep traffic closed on restored data. Current references cannot be recomputed without the old secret. Implement and exercise versioned dual-read/dual-write before any planned rotation.

## Rollback

Migration 0015 is additive and must not be removed after sessions or suppressions exist. An older API may read legacy sessions but cannot safely issue/protect verified identity or replay v2 erasure semantics. Roll back application traffic only with identity issuance held and a compatible erasure worker/reconciler still available. Never reactivate a `deletion_pending` user or remove a suppression to make rollback appear healthy.

## Primary references

- [Taro `login` API](https://docs.taro.zone/en/docs/apis/open-api/login/)
- [WeChat Mini Program login flow](https://developers.weixin.qq.com/miniprogram/en/dev/framework/open-ability/login.html)
- [ADR-0016](../architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
