# ADR-0059: Privacy custody actions require current read authority

Date: 2026-08-05

Status: accepted

## Context

The privacy page combines two sensitive sources: a locally retained account-erasure receipt that may need recovery after response loss, and the service's current data inventory and consent ledger. Before this decision, retrying a failed first overview read could skip receipt recovery, and a failed refresh after consent revocation could leave the old active consent and inventory visible while export, further revocation and erasure preparation remained operable.

An empty inventory is a service fact, not a default React state. A retained overview may help the user understand what was last seen, but it cannot authorize a new custody operation. Persisting another sensitive account inventory or replaying destructive operations is outside this local reliability scope.

## Decision

- Model `initial-loading`, `ready`, `refreshing`, `initial-error` and `stale` independently of inventory count.
- The first authority read, including every retry before a snapshot exists, must recover a pending local erasure receipt before it requests the privacy overview. Receipt recovery is never bypassed by the overview retry path.
- Accept a privacy overview only after its complete read succeeds. A failed first read must not render a zero inventory, active-consent assumptions or any export/revocation/erasure controls.
- A failed refresh may retain the last accepted inventory and consent ledger in current page memory, but must label the projection stale and freeze export, optional-consent revocation, export-skipping, the erasure acknowledgement, confirmation phrase and permanent-delete submission.
- Keep navigation back, profile editing and logout available because they do not consume the uncertain custody snapshot.
- Classify offline transport, HTTP 4xx refusal, HTTP 5xx service outage and unknown failure into product-owned copy without exposing backend messages.
- Provide one foreground retry with a concurrent-call guard and explicit pointer/Enter/Space semantics. A failed authority read moves H5 focus to the retry.
- Do not add polling, a persistent overview cache, optimistic inventory/consent facts, background synchronization or mutation replay.

## Consequences

Zero inventory and consent state now appear only after the service has returned an accepted overview. A retained ledger remains useful as read-only evidence, while the page makes clear that it is not current authority. The page can still recover a lost account-erasure response before any overview-dependent interaction.

The state model and presentation add 6,276 bytes to H5 and 7,238 bytes to WeApp. H5 entry/largest async remain 319,235/199,198 bytes; WeApp vendor and largest page remain 18,915/55,523 bytes. Narrow total ceilings move to 2,626,000 H5 and 913,000 WeApp; entry, async, vendor and page ceilings remain fixed.
