# ADR-0051: Ambiguous create responses retain one unchanged-payload idempotency key

Date: 2026-08-05

Status: accepted

## Context

Health-record creation already sends an idempotency key, and the API stores it with a request hash under a unique `(user_id, idempotency_key)` constraint. The client nevertheless presented every thrown request error as raw failure text. If PostgreSQL committed and the response was lost, a user could not tell whether the record existed, could interpret “failed” as authoritative, or could submit another request with a new key after changing page state.

The 24-hour local draft vault protects page-owned inputs across interruption, but it is not a network queue and does not define an in-session unknown-result retry. The UI needs to preserve uncertainty, avoid duplicate facts and distinguish a transport problem from an HTTP refusal without persisting request replay state or expanding sensitive-photo custody.

## Decision

- A dependency-free client presentation contract classifies save errors into `network_uncertain`, `service_unavailable`, `server_rejected` and `unexpected`. Taro/fetch network markers and retryable 408/425/429/5xx statuses receive explicit retry copy; other HTTP statuses are server refusal and keep the returned message visible.
- A health-record create attempt generates one idempotency key. An ambiguous or retryable failure keeps that key only while the submitted draft remains unchanged. Explicit retry sends the same payload/key; any metric, value, unit, time, timezone or overlap-offset change clears both the recovery state and key.
- The page never marks an ambiguous request successful. It retains visible input, exposes a polite atomic status and changes the enabled primary action to `重试保存（防重复）`. Successful retry clears the draft/key and inserts the server response once.
- Corrections do not claim create-level idempotency. Their recovery copy requires the user to recheck the current revision before another save.
- No request payload or idempotency key is added to persistent storage, no automatic/background replay is scheduled and no photo media, consent or unconfirmed candidate enters this contract.
- Browser acceptance must let the real API commit the first request, abort only its browser response, then prove that retry uses the exact same non-empty key and produces one visible aggregate.
- Taro H5 button styling must match `disabled="true"`, not attribute presence, because the custom element renders `disabled="false"` for enabled controls.

## Consequences

A response-loss window is now represented honestly: the user sees an unresolved save, keeps their input and can reconcile through an explicit duplicate-safe retry. The existing API idempotency constraint remains the authority; no new server code, migration, dependency or storage format is needed.

The implementation currently covers health-record creates only. Workout and meal creates already have equivalent in-memory keys and server idempotency, but their pages still need the shared presentation/reset contract and real lost-response evidence. Corrections, deletes and sensitive photo operations require operation-specific reconciliation rather than a blanket retry policy.

The shared recovery module and record-page state increase measured production totals to 2,423,196 H5 bytes and 826,369 WeApp bytes. Total ceilings move narrowly to 2,424,000 and 827,000; H5 entry/async and WeApp vendor/largest-page ceilings remain unchanged.
