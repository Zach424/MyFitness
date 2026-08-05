# ADR-0075: Meal-favorite response-loss recovery

Date: 2026-08-05

Status: accepted

## Context

Meal favorites are owner-scoped snapshots independent from saved meals. Their API already exposes a replace-style `PUT /nutrition/favorites/:foodKey`, a `DELETE` for the same key and one current owner list. The client previously handled an interrupted response as an ordinary error and left the toggle active. A repeated save is key-idempotent in storage, but can still replace an already committed snapshot with changed draft values; a repeated delete has no equivalent mutation identity. Either repeat also hides whether the first request committed.

Aggregate reconciliation cannot be copied literally because favorites have no aggregate revision or exact-resource endpoint. Their strongest available authority is the complete current favorite list. That list must refresh independently from the meal draft: favorite state is reusable preference evidence, while meal items are the user's current unsaved fact snapshot.

## Decision

- Add one dependency-free favorite-recovery module for failure authority, submitted-snapshot equality and current-list evidence classification.
- Network, retryable service and unknown adapter outcomes require reconciliation. Explicit non-retryable 4xx refusal terminates the attempt.
- Retain only the operation, food key, food display name and exact submitted PUT input in React page memory. Persist no request, recovery instruction or offline command.
- While a receipt exists, disable every favorite toggle but leave meal editing and save under their existing nutrition read authority.
- Reconciliation issues only the existing owner-authenticated favorite-list GET. It never sends PUT or DELETE.
- Accept PUT completion only when the current list contains the same food key and a deep-equal food snapshot plus default serving. Treat a present but different snapshot as divergent. Treat absence as no evidence of the prior save and require another explicit toggle if the user still wants it.
- Accept DELETE completion only when the food key is absent. If it is present, require another explicit toggle instead of replaying deletion.
- Replace the accepted favorite list from the reconciliation response without changing the meal draft, entered servings, selected source tab or saved meal snapshots.
- A failed list read keeps the same receipt/action; a terminal refusal closes without a read. Add no API, schema, database, polling, background replay or queue.

## Consequences

An ambiguous favorite action no longer appears as a settled failure or invites a blind repeat. Product copy names current-list authority, focuses one guarded reconciliation action and keeps uncertainty distinct from success, divergence and explicit refusal. The limit is also explicit: list absence proves only the owner-visible favorite state, not a physical-network event outside the service.

Six unit cases cover failure authority, exact snapshot/serving comparison and save/remove evidence. A real-service browser test commits PUT before aborting only the browser response, confirms the matching list with one PUT, then aborts DELETE before commit, confirms the favorite is still present and sends a second DELETE only after a new explicit click. The meal title, food item, serving and source tab remain unchanged. The full main browser suite passes 86/86 and OIDC passes 3/3.

Measured H5 total grows from 2,802,178 to 2,808,130 bytes and WeApp from 1,027,824 to 1,034,512. Only total ceilings move to 2,810,000 and 1,036,000; H5 entry/largest async remain within 320,000/208,000 and WeApp vendor/largest page remain within 25,000/56,100.

Profile/goal PUT remains the next local response-loss gap. Its current 409 reconciliation covers known conflicts but an interrupted response still needs exact current-revision/content evidence before another write.

## References

- [ADR-0006](0006-nutrition-snapshot-aggregate.md)
- [ADR-0051](0051-ambiguous-create-response-recovery.md)
- [ADR-0052](0052-authority-aware-sensitive-workbench-recovery.md)
- [ADR-0074](0074-aggregate-correction-response-loss-recovery.md)
- [Nutrition model](../NUTRITION_MODEL.md)
- [Architecture baseline](../ARCHITECTURE.md)
- [Design system review](../../design/DESIGN_SYSTEM.md)
