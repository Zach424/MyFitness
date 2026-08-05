# ADR-0051: Ambiguous create responses retain one unchanged-payload idempotency key

Date: 2026-08-05

Status: accepted

## Context

Health-record creation already sends an idempotency key, and the API stores it with a request hash under a unique `(user_id, idempotency_key)` constraint. The client nevertheless presented every thrown request error as raw failure text. If PostgreSQL committed and the response was lost, a user could not tell whether the record existed, could interpret “failed” as authoritative, or could submit another request with a new key after changing page state.

The 24-hour local draft vault protects page-owned inputs across interruption, but it is not a network queue and does not define an in-session unknown-result retry. The UI needs to preserve uncertainty, avoid duplicate facts and distinguish a transport problem from an HTTP refusal without persisting request replay state or expanding sensitive-photo custody.

## Decision

- A dependency-free client presentation contract classifies save errors into `network_uncertain`, `service_unavailable`, `server_rejected` and `unexpected`. Taro/fetch network markers and retryable 408/425/429/5xx statuses receive explicit retry copy; other HTTP statuses are server refusal and keep the returned message visible.
- Each health-record, workout or meal create attempt generates one idempotency key. An ambiguous or retryable failure keeps that key only while the submitted draft remains unchanged. Explicit retry sends the same payload/key; any aggregate payload change clears both the recovery state and key.
- The page never marks an ambiguous request successful. It retains visible input, exposes a polite atomic status and changes the enabled primary action to `重试保存（防重复）`. Successful retry clears the draft/key and inserts the server response once.
- Corrections do not claim create-level idempotency. Their recovery copy requires the user to recheck the current revision before another save.
- No request payload or idempotency key is added to persistent storage, no automatic/background replay is scheduled and no photo media, consent or unconfirmed candidate enters this contract.
- Browser acceptance must let the real API commit the first request, abort only its browser response, then prove that retry uses the exact same non-empty key and produces one visible aggregate.
- Taro H5 button styling must match `disabled="true"`, not attribute presence, because the custom element renders `disabled="false"` for enabled controls.

## Consequences

A response-loss window is now represented honestly: the user sees an unresolved save, keeps their input and can reconcile through an explicit duplicate-safe retry. The existing API idempotency constraint remains the authority; no new server code, migration, dependency or storage format is needed.

The implementation covers all three core manual record creates. Each has real lost-response evidence against its unchanged API idempotency path. Corrections, deletes, action-definition mutations and sensitive photo operations still require operation-specific reconciliation rather than a blanket retry policy.

The shared recovery module and three editor states increase measured production totals to 2,429,088 H5 bytes and 828,519 WeApp bytes. Total ceilings move narrowly to 2,430,000 and 829,000; the largest WeApp page moves to 40,229 with a 40,500-byte ceiling. H5 entry/async and WeApp vendor ceilings remain unchanged.
