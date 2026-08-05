# ADR-0048: Keep mutable action definitions off the workout recording route

Date: 2026-08-05

Status: accepted

## Context

The workout page combined two different jobs: recording one training session and maintaining the owner's reusable action definitions. Iteration 048 also added the shared definition revision ledger to the embedded editor. The resulting WeApp page was the repository maximum at 50,338 bytes and had little room below the 50,500-byte gate.

Moving the editor to a newly registered Taro page reduced workout JavaScript, but the first production build increased H5 total size from 2,444,138 to 2,566,891 bytes because another route repeated the H5 page runtime. That version failed the existing 2,450,000-byte total gate and was not acceptable.

## Decision

- The workout page owns only active catalog search, snapshot selection and workout facts. It no longer imports create/correct/archive/history APIs, definition form state, form validation or the revision ledger.
- `管理我的动作` navigates to an action-specific view in the already lazy owner-register route. The registered route remains `/pages/food-catalog/index` for compatibility and dispatches by the strict local `kind=exercise` parameter; no new top-level page runtime is registered.
- The action view owns create, optimistic correction, archive confirmation, 10-at-a-time revision history and active custom-definition listing. Its form model is isolated from the workout model.
- Both food and action views reuse the same owner-register layout classes and shared `DefinitionRevisionLedger`. Action-specific style output is limited to the one layout rule that the food form does not need.
- Taro navigation preserves the underlying workout page instance. On every `useDidShow`, the workout page reloads active catalog definitions. A new/corrected definition becomes selectable and an archived definition leaves search, but the current workout draft and previously saved workouts retain their copied snapshots.
- User-entered action content remains descriptive, owner-confirmed data. The register does not validate suitability, technique or safety and does not feed a new planning rule.
- The WeApp total ceiling moves narrowly from 807,000 to 811,000 bytes for the dedicated register shell, while the page-JavaScript ceiling tightens from 50,500 to 45,700 bytes. H5 entry, async and total ceilings remain unchanged.
- Browser test infrastructure accepts an isolated API origin/port and forwards it to the API and administrator BFF. This allows reproducible validation without terminating an unrelated process occupying the default port.

## Consequences

The workout artifact falls to 39,297 bytes. The repository maximum becomes the existing nutrition page at 45,512 bytes, an actual 4,826-byte reduction from the previous largest page and an 11,041-byte reduction for workouts. H5 remains below its unchanged total ceiling at 2,447,176 bytes because the owner views share one lazy route runtime. WeApp total grows by 4,198 bytes to 810,931 for the new register shell, but the tightened page gate prevents the change from being represented only as a larger budget.

The route's legacy `food-catalog` filesystem name now hosts both owner-definition modes. This is an internal compatibility compromise; a later route rename may improve naming but must not reintroduce a second runtime or break back navigation. The nutrition page is now the measured largest WeApp page and its optional sensitive photo workflow is the next split candidate.

## Rejected alternatives

- Keep the modal embedded: rejected because recording and definition governance remain coupled and the measured largest page does not improve.
- Register a new action-catalog page: rejected after the production artifact exceeded the unchanged H5 total gate by 116,891 bytes.
- Persist the workout draft before navigation: rejected because sensitive local drafts have a separate 24-hour recovery contract and ordinary in-stack navigation already preserves the page instance.
- Refresh the full workout page on return: rejected because it could discard unsaved facts and performs unrelated record reads.
- Raise only the old page ceiling: rejected because the acceptance criterion is an actual largest-page reduction.
