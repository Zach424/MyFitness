# Administrator access runbook

Status: local implementation evidence; production identity tenant, access owner, retention owner and alert delivery are not yet assigned

## Production prerequisites

1. Select an enterprise OIDC provider and create a confidential web client dedicated to MyFitness administrators.
2. Register only the exact HTTPS callback `https://<admin-host>/api/operator/oidc/callback`; do not use wildcard redirects.
3. Store `ADMIN_OIDC_CLIENT_SECRET`, API signing/hash secrets and database credentials in a secret manager. They must not enter browser bundles, logs or committed files.
4. Configure the API with `ADMIN_OIDC_ISSUER`, `ADMIN_OIDC_AUDIENCE`, `ADMIN_OIDC_JWKS_URL`, `ADMIN_AUDIT_HASH_SECRET` and a reviewed `ADMIN_SESSION_MINUTES`.
5. Configure the Next.js BFF with `MYFITNESS_API_URL`, authorization/token URLs, client ID/secret and redirect URI. Keep `ADMIN_ENABLE_LOCAL_LOGIN=false` and `ADMIN_COOKIE_SECURE=true`.
6. Apply migration `0012_admin_support_boundary.sql`, deploy API before the admin UI, and verify administrator routes are private from ordinary users.
7. Assign named owners for operator approval, quarterly recertification, audit retention, security alerts and incident response before onboarding a real operator.

## Provision one OIDC operator

Obtain the exact provider issuer and immutable OIDC `sub` through an approved identity-administration process. Do not derive the subject from email or a display name. Generate two UUIDv4 values outside SQL, have a second reviewer verify the ticket and roles, then run a parameterized equivalent of this transaction:

```sql
BEGIN;

INSERT INTO admin_operators (id, display_name)
VALUES ('<operator-uuid>', '<reviewed display label>');

INSERT INTO admin_identities (
  id, operator_id, provider, issuer, provider_subject, verified_at
) VALUES (
  '<identity-uuid>', '<operator-uuid>', 'oidc',
  '<exact configured issuer>', '<immutable oidc subject>', NOW()
);

INSERT INTO admin_operator_roles (operator_id, role)
VALUES ('<operator-uuid>', 'support_reader');

COMMIT;
```

Grant `audit_reader` only when the approved job requires global administrator access evidence. A support operator does not need it by default. Record the approver, ticket and expiry/recertification date in the external access-management system; those workflow fields are not yet modeled in MyFitness.

## Verification after provisioning

1. Complete enterprise login in a fresh browser profile.
2. Verify the API accepts the configured issuer/audience and the UI reports the expected provider and roles.
3. Attempt an ungranted function and confirm `403` plus an `authorization.denied` audit event.
4. Use a dedicated test account UUID and approved ticket to perform one bounded support lookup.
5. Verify the result contains aggregate/lifecycle evidence only and exposes a `lookupReceiptId`.
6. Verify normal user Bearer tokens receive `401` from administrator routes and the operator token receives `401` from user health routes.
7. Revoke the browser session and verify the old token can no longer authenticate.

## Disable an operator immediately

Execute in one transaction and preserve the external incident/access ticket:

```sql
BEGIN;

UPDATE admin_operators
SET status = 'disabled', updated_at = NOW()
WHERE id = '<operator-uuid>' AND status = 'active';

UPDATE admin_sessions
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE operator_id = '<operator-uuid>' AND revoked_at IS NULL;

COMMIT;
```

Then disable the account at the identity provider, verify a fresh OIDC exchange fails, inspect recent audit events, and follow the incident process if access may have been compromised. Do not delete the operator or audit rows to “clean up” history.

## Change roles

Add or remove rows in `admin_operator_roles` through a reviewed transaction. The API reads roles on every request, so changes take effect on the next call. Removing all roles makes active sessions unusable; also revoke them so the lifecycle is explicit. Never grant a role by editing a session.

## Audit investigation

- Use `GET /v1/admin/audit?limit=<1..100>` with an `audit_reader` session; follow only the returned opaque cursor.
- Correlate by `requestId`, action, outcome, time and HMAC target reference. Do not attempt to reverse target references.
- A support lookup returns its audit event ID as the receipt. The audit row stores ticket/reason as bounded details but no raw user ID.
- Any attempted `UPDATE` or `DELETE` against `admin_audit_events` must fail with `admin audit events are append-only`.
- Exporting or retaining audit outside the primary database is not implemented. Do not claim the current table is a WORM archive.

## Secret rotation

- Rotating the OIDC client secret requires a coordinated BFF restart and a fresh login canary.
- Rotating `ADMIN_AUDIT_HASH_SECRET` changes all future target fingerprints. Historical and new fingerprints will no longer correlate; treat this as a reviewed audit-boundary event and preserve the rotation time externally.
- Rotating API database or OIDC configuration requires an authentication denial/success canary, role-denial test and session-revocation test.
- Administrator API tokens are opaque session credentials; revoke sessions rather than attempting token-key rotation.

## Incident conditions

Escalate when OIDC verification failures spike, replay/nonce/audience denials appear unexpectedly, role denials diverge from approved access, lookup volume is unusual, audit writes fail, or a disabled operator authenticates. Preserve request IDs and aggregate evidence only; never paste health records, access tokens, ID tokens, provider subjects or image content into an incident channel.

## Local-only evidence mode

Set `ADMIN_ENABLE_LOCAL_LOGIN=true` in the admin app only for an isolated local environment. Optional `ADMIN_LOCAL_*` variables choose the demonstration label and roles. The API itself must not run with `NODE_ENV=production`; production deliberately responds `404` and records `dev_issuer_disabled`. Local evidence mode is not a fallback for an unavailable enterprise identity provider.
