# Identity and onboarding model

Status: implemented through the local iteration-011 privacy ownership boundary

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

| Table             | Purpose                               | Important invariants                                                                        |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `users`           | Stable product identity               | UUID primary key; lifecycle timestamps                                                      |
| `auth_identities` | Replaceable provider subject mapping  | Unique provider + subject; cascades with user                                               |
| `auth_sessions`   | Revocable opaque session lookup       | Unique token hash; expiry required; last-used timestamp                                     |
| `user_profiles`   | Adult baseline and safety eligibility | Adult confirmation required; canonical height 100–250 cm; revision starts at 1              |
| `user_goals`      | Current planning constraints          | Enumerated goal/experience; 1–7 unique weekdays; 15–180 minutes; non-empty equipment        |
| `consent_events`  | Purpose/version lifecycle receipts    | Append acceptance rows; withdrawal timestamps the active interval; renewed grant adds a row |

Risk flags are a bounded enum. No flags produces `eligible`; one or more produces `professional_clearance_required`. This status controls future plan generation, not the ability to own or export records, and must not be presented as a diagnosis.

## Update behavior

Profile and goal changes run in one database transaction. The service locks the current profile and compares `expectedRevision`; a stale client receives a conflict rather than overwriting newer data. Height is converted to canonical centimeters while its chosen display value/unit are retained. Consent writes use append-only events, so a profile revision cannot rewrite when or which policy version was accepted.

The current versions are `2026-07-18` for terms, privacy and health-data processing. A client must send the exact active versions. Required service purposes remain active until account erasure. Optional AI-plan and food-photo purposes can be withdrawn; a later explicit request adds a new acceptance row rather than clearing the prior revocation. The privacy center exports every interval and erases consent receipts with the account.

## Environment boundary

`POST /v1/auth/dev/session` is a local adapter for repeatable development and tests. It maps a stable subject to the same user and returns a new seven-day opaque token. The route fails closed in production. A verified WeChat or phone adapter will write `auth_identities` and issue the same session/principal shape, keeping downstream authorization unchanged.
