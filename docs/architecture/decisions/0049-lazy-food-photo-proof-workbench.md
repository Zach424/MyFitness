# ADR-0049: Lazy food-photo proof workbench with confirmed-only return

Date: 2026-08-05

Status: accepted

## Context

The nutrition recording page owned the complete optional food-photo lifecycle: recent-candidate loading, per-request consent, image choice, upload, private preview, uncertain candidate selection, gram editing, confirmation and deletion. That made sensitive workflow state resident whenever a user opened manual meal recording and made nutrition the largest WeApp page at 45,512 bytes. It also blurred two different jobs: recording user-confirmed meal facts and reviewing temporary AI proposals.

The existing API boundary is correct: a photo candidate cannot create a meal, confirmation deletes media and returns catalog-bound draft inputs, and the normal meal save remains separate. The client split must preserve that authority, keep photos and unconfirmed candidates out of the recoverable meal-draft vault, and work in both H5 and WeChat Mini Program navigation stacks.

## Decision

- Keep the nutrition page responsible for meal facts only. It renders a compact explanation and opens the food-photo workbench on the existing lazy private-photo route with `kind=food`; opening nutrition no longer lists photo candidates.
- Let the workbench exclusively own photo reservation, current-version consent, upload, candidate recovery, private preview, selection, gram editing, explicit deletion and unavailable-result handling.
- Return data through Taro's opener `EventChannel`, not URL parameters, application storage or a process-global handoff. The workbench emits only the server-confirmed `{ catalogKey, grams }[]` after `POST .../confirm` succeeds; direct route visits without an opener cannot confirm and therefore cannot delete media while losing the returned draft.
- Keep the still-open nutrition page instance and its unsaved draft in the navigation stack. The event listener maps confirmed catalog keys to deterministic starter-catalog snapshots and appends them to the draft. Only that confirmed result may subsequently enter the existing 24-hour meal-draft vault.
- Validate selected keys, uniqueness, integer grams and displayed portion ranges in an isolated client model before confirmation. This is interaction validation in addition to, not instead of, the authoritative shared/API validation.
- Reuse the registered progress-photo route rather than adding another route runtime. The food workbench has a separate component/model/style boundary and does not read progress-photo data or the current meal draft.
- Do not change the food-photo API, database, consent version, 24-hour expiry, durable deletion jobs, privacy withdrawal behavior, provider boundary or the rule that AI output is a proposal rather than a record.

## Consequences

Manual nutrition recording no longer initializes photo state or performs a photo-candidate request. Photos and uncertain candidates remain inside a visibly distinct private-custody workbench, while a confirmed return preserves the exact open meal title and items.

The nutrition page falls from 45,512 to 36,410 WeApp JavaScript bytes. The private-photo route grows from 19,037 to 32,956 bytes, and the repository maximum falls to 39,297 bytes. H5 total falls from 2,447,176 to 2,409,603 bytes and largest async JavaScript falls from 206,946 to 185,926 bytes. The richer private workbench raises the WeApp total from 810,931 to 819,662 bytes, so its total-tree ceiling moves narrowly to 820,000 while the page ceiling tightens from 45,700 to 39,500; H5 total/async ceilings tighten to 2,410,000/187,000.

`EventChannel` is now a cross-end navigation contract and must retain H5 browser and WeApp build proof. It is deliberately single-hop and in-memory: a refresh or direct deep link does not reconstruct a confirmed handoff. The authoritative photo candidate remains recoverable through the API until the user confirms, deletes or reaches expiry.
