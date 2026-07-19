# ADR-0014: Independent operator trust boundary and evidence-only support

Date: 2026-07-19

Status: accepted

## Context

End-user sessions authorize access to sensitive records owned by one user. Reusing those sessions, adding an `isAdmin` flag to users or exposing generic database CRUD would create an escalation path and make support access difficult to audit. The first operator workflow only needs enough evidence to help with account access, export, erasure and technical tickets; it does not need the underlying health, workout, meal, plan, AI or photo content.

The management browser also cannot be trusted with an enterprise client secret or a durable API token. Production operator identity must be verifiable against an external identity provider while still requiring server-side pre-provisioning and immediate role/disable checks.

## Decision

- Use independent operator, identity, role, session, OIDC-exchange and audit tables. User and administrator Bearer tokens are never interchangeable.
- Use Authorization Code + PKCE, state and nonce in the Next.js BFF. Authorization, token and callback URLs are HTTPS in production. The NestJS API independently verifies the resulting ID token with remote JWKS, exact non-normalized issuer, audience, age and nonce.
- Require a pre-provisioned active `(provider, issuer, subject)` and consume each ID-token hash once before issuing an opaque `mf_admin_*` session.
- Keep the API token in an `HttpOnly`, `SameSite=Strict`, secure-by-default BFF cookie. Browser JavaScript calls same-origin BFF routes only.
- Limit roles to `support_reader` and `audit_reader`, resolving current grants on every request.
- Allow support lookup only by exact account UUID plus ticket reference and enumerated reason. Return lifecycle and aggregate evidence only.
- HMAC administrator audit targets, bound detail fields, attach request correlation and reject audit-row updates/deletes with a database trigger.
- Keep the local operator issuer explicit and production-disabled at the API, independent of management-UI configuration.

## Consequences

Compromise of a normal user token does not grant operator access, and an operator token cannot call user-owned record endpoints. Support staff cannot enumerate users or inspect sensitive content. Role changes and operator disablement take effect without waiting for session expiry. OIDC replay, wrong audience, wrong nonce and unknown identities fail closed and leave denied evidence where verification permits.

The system now owns a separate identity lifecycle that operations must provision, review, revoke and retain. Primary-database append-only enforcement does not replace independent audit export or backup governance. OIDC provider choice, tenant configuration, client-secret custody, just-in-time approval, periodic access review and named incident ownership remain release gates.

## Alternatives rejected

- **Admin flag on end-user accounts:** mixes two trust domains and creates session confusion.
- **Generic ORM/database console:** exposes mutation and content browsing beyond the support purpose.
- **Trust the BFF without API token verification:** makes network placement the authorization boundary and weakens defense in depth.
- **Search by name/phone/email:** enables enumeration and returns more identifying data than the ticket workflow requires.
- **Store raw target IDs in audit:** turns the audit stream into another directly identifying user index.

## References

- [Next.js installation and production build documentation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js 16.2.10 release](https://github.com/vercel/next.js/releases/tag/v16.2.10)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
