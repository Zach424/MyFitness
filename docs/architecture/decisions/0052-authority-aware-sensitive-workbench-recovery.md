# ADR-0052: Sensitive workbench recovery follows operation authority

Date: 2026-08-05

Status: accepted

## Context

The core record editors can retry ambiguous creates because each API already binds an owner-scoped idempotency key to an exact request hash. The lazy owner-action register and private food-photo workbench contain a more varied set of writes. Action correction/archive use optimistic revisions, photo upload consumes a signed reservation and media bytes, photo confirmation clears candidate content while starting durable media deletion, and explicit deletion changes logical and physical custody state.

Presenting every thrown request as a generic failure invites unsafe repetition. Presenting it as success is worse: a committed photo confirmation whose response is lost cannot be reconstructed from the reviewable-candidate list, and an absent candidate is not proof that object storage has completed physical deletion. A stage-specific authority contract is required before adding recovery controls.

## Decision

The dependency-free client matrix classifies each operation and then combines that policy with network ambiguity, retryable service outage, explicit server refusal or an unexpected adapter error.

| Operation                    | Ambiguous authority    | Page-owned input retained      | Prohibited behavior                                                     |
| ---------------------------- | ---------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Action definition create     | Retry the same request | Definition form                | New key while unchanged; background replay                              |
| Action definition correction | Reconcile first        | Definition form                | Blind `PUT` replay                                                      |
| Action archive               | Reconcile first        | None                           | Automatic `DELETE` replay or fake archive success                       |
| Food definition create       | Retry the same request | Nutrient/reference form        | New key while unchanged; background replay                              |
| Food definition correction   | Reconcile first        | Nutrient/reference form        | Blind `PUT` replay or treating matched input as verified nutrition      |
| Food archive                 | Reconcile first        | None                           | Automatic `DELETE` replay or fake archive success                       |
| Photo reservation            | Retry the same request | None                           | Persisting a selected file/path or background upload                    |
| Photo upload/analysis        | Reconcile first        | None                           | Replaying media bytes automatically                                     |
| Photo candidate confirmation | Reconcile first        | Review selection while visible | Replaying confirmation or emitting an unknown handoff                   |
| Photo candidate deletion     | Reconcile first        | None                           | Replaying deletion or claiming physical-byte deletion from list absence |
| Progress-photo reservation   | Retry the same request | View/retention/consent intent  | Persisting a selected file/path or creating a changed request on retry  |
| Progress-photo upload/check  | Reconcile first        | View/retention/consent intent  | Replaying media bytes or deleting a possibly ready item before reading  |
| Progress-photo deletion      | Reconcile first        | None                           | Replaying deletion or claiming physical-byte deletion from list absence |

- An explicit non-retryable server response terminates the current attempt. Its returned message remains visible, but it does not imply that an uncertain write succeeded.
- Action and food create keep one in-memory key only while every submitted definition field is unchanged. Photo reservation keeps one key only until a reservation ticket is successfully read or the terminal attempt is dismissed. Neither key, request nor media path enters application storage.
- Action and food correction read the current active catalog. They report a lost correction as accepted only when the current revision advanced and all submitted definition fields match. A different current revision becomes the new comparison base while the page-owned draft remains visible. Matching a food form establishes request-result agreement, not nutritional verification.
- Action and food archive read the active catalog. Absence proves only that the definition is no longer available for future selection; it does not rewrite workout/meal drafts, persisted records or their snapshots.
- Photo upload, confirmation and deletion use the reviewable-candidate list only as a read-side reconciliation boundary. A matching candidate remains an unconfirmed proposal. A missing confirmation target cannot produce a meal-draft event because the authoritative response was not received. A missing deletion target can close the proof view but cannot claim that the durable object-deletion job is finished.
- Progress-photo reservation retains one request key and exact captured-at/view/retention/consent payload but requires the user to choose the local image again; no file/path is retained. Upload failure never triggers automatic deletion because a ready transition may have committed before the response was lost. The private ready list can recover the exact photo ID without replaying bytes; absence ends the attempt under reservation/retention expiry. Delete reconciliation uses list absence only to prove loss from the private contact sheet, while object deletion remains a durable-job claim.
- Reconciliation is user initiated, foreground only and never a queue. Upload, confirmation and deletion are not automatically replayed.
- Taro H5 write controls expose explicit `aria-disabled` and share pointer/Enter/Space callback guards. A bare custom-element `disabled` attribute is not accepted as sufficient prevention of an authority-violating replay.

## Consequences

Ambiguous workbench writes now preserve uncertainty without duplicating definitions or turning owner-entered nutrients or AI proposals into verified facts. Real API browser proof covers committed-but-lost action/food create and archive, food correction and photo reserve/confirm/delete paths; the photo tests also exercise local private object storage. The food create proof reuses one exact key and renders one definition, while correction/archive show no success before current-catalog evidence. The upload stage is covered by the same reconcile-first policy and unit matrix but is not claimed as a real radio-interruption test.

The client intentionally cannot recover a committed photo-confirmation payload after its response is lost because the current API clears candidate content and exposes no confirmed-result read. The safe outcome is no handoff, not a guessed draft. Adding an owner-authenticated confirmation receipt would require a separate retention/privacy decision.

Adding progress-photo parity increases measured H5 total/largest async JavaScript to 2,456,895/198,207 bytes and WeApp total/largest page to 856,228/42,976 bytes. H5 entry and WeApp vendor remain 318,996 and 18,915 bytes. Corresponding total/async/page ceilings move narrowly; unrelated entry/vendor ceilings remain fixed.
