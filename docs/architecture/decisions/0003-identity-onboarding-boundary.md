# ADR-0003: Provider-neutral identity and adult onboarding boundary

Date: 2026-07-18

Status: accepted

## Context

Health records cannot be safely scoped by a caller-provided user ID. The first public clients will include WeChat Mini Program and H5, while the production identity provider and account-linking policy are not yet selected. Onboarding also needs adult eligibility, planning constraints, risk exits and purpose/version consent without conflating them with medical diagnosis.

## Decision

- Create stable `users`, provider/subject `auth_identities`, and revocable opaque `auth_sessions`.
- Return raw Bearer tokens only to the client and persist only SHA-256 token hashes.
- Resolve the current principal in a NestJS guard and derive all resource ownership from it.
- Keep the development issuer as an adapter that is unavailable in production, rather than embedding demo IDs into protected APIs.
- Persist profile, goal and risk eligibility transactionally with optimistic revision checks.
- Persist accepted terms, privacy and health-data purpose/version pairs as immutable events.
- Restrict the present product to adults who explicitly confirm they are at least 18.
- Treat any selected risk flag as a professional-clearance gate for future planning, not as a diagnosis.

## Consequences

Health records and onboarding now exercise a real server-owned authorization boundary, and production identity adapters can be added without changing business controllers. Token leakage in a database snapshot does not reveal usable raw tokens, although hashes still require access control and sessions require revocation/rotation operations. Concurrent profile edits fail explicitly instead of being lost.

The development issuer is still not a production login system. Verified provider tokens, account linking, rate limits, credential recovery, device/session management, consent revocation and administrative audit workflows remain required before a shared beta.
