# ADR-0042: Conflict-safe recovery for unsaved corrections

Date: 2026-08-05

Status: accepted

## Context

ADR-0040 protected unsaved new workout, meal and health-record forms, but deliberately excluded corrections. A refresh during correction still discarded meaningful work. Persisting only the edited fields is insufficient: the server record may be corrected or deleted elsewhere while the local copy waits, so blindly restoring and later submitting could present an obsolete form as current.

The API already owns authorization, current aggregate state and optimistic concurrency. The local client needs recovery without becoming a second source of truth, storing a server snapshot or weakening `expectedRevision` checks.

## Decision

1. Extend the existing page-owned draft payloads with one optional exact correction target: aggregate UUID plus positive base revision. Keep the `myfitness-sensitive-draft/v1` envelope, storage key, owner scope, 24-hour expiry and 96 KiB ceiling unchanged because older create payloads remain structurally compatible.
2. Add correction metadata only when an existing health record, meal or workout enters correction mode. New forms and repeat flows have no correction target. Request builders never copy this local metadata into API writes.
3. Autosave only after the correction differs from the server-derived editor baseline. A merely opened correction creates no additional local copy.
4. On reload, require an explicit restore/discard decision. Before restoring a correction, re-list the current owner-visible aggregates through the normal authenticated endpoint and require the same aggregate ID and revision. Ownership remains server-derived; no owner ID is accepted from the payload.
5. If the aggregate is missing or its revision differs, clear the obsolete draft and explain that the current server record was not overwritten. If verification cannot complete, keep the draft and allow retry rather than guessing.
6. After a successful recheck, restore the fields and enter ordinary correction mode using the freshly returned aggregate as the editing authority. Saving still sends that aggregate's `expectedRevision`; any change between recheck and write therefore returns the existing `409` conflict.
7. Keep the correction-aware ticket visibly distinct from a new-entry draft: show the base revision and use Restore/Discard Modification language. Do not expose aggregate UUIDs or imply that a local draft is a saved server version.
8. Successful save, cancel, explicit discard, logout and erasure initiation clear the local copy under the existing ADR-0040 lifecycle. No API, database, export, erasure or provider contract changes.

## Consequences

Short interruptions no longer erase unsaved corrections, while stale or deleted targets cannot be restored as though current. The check is intentionally owner-list based and server-authoritative. It does not lock an aggregate; normal optimistic concurrency remains the final write guard.

The exact payload guards prevent extra identity or server-response fields from entering application storage. Application-storage encryption/shared-device limitations remain unchanged, and a network outage can postpone restoration until the current revision is verifiable.

The correction interaction adds measured code to all three lazy editors. Reviewed ceilings move only for affected production-tree dimensions: H5 total `2,290,000`, largest async JavaScript `203,000`, WeApp total `780,000` and largest page JavaScript `48,000` bytes. H5 entry `320,000` and WeApp vendor `25,000` remain unchanged. The accepted build measures H5 `2,287,257` total, `318,290` entry and `202,010` largest async bytes; WeApp `776,487` total, `18,915` vendor and `46,718` largest page bytes.

## Alternatives rejected

- Restore corrections without checking the server: makes an obsolete form appear current and increases accidental conflict/overwrite risk.
- Store the whole server aggregate: duplicates sensitive data, expands schema/retention exposure and still cannot prove currentness.
- Make the API accept a draft token that bypasses revision checks: weakens the established concurrency contract.
- Auto-discard on any verification error: turns a temporary outage into data loss.
- Store owner identity inside the correction payload: duplicates a trust decision already enforced by the envelope and authenticated API.
- Add a new envelope version only for an optional compatible field: creates migration complexity without changing the vault's lifecycle or trust boundary.
