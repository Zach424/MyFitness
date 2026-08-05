# ADR-0053: Weekly-plan writes reconcile authority before replay

Date: 2026-08-05

Status: accepted

## Context

Week Fold has four writes with superficially similar controls but different evidence. Generation accepts only a Monday and an idempotency key, yet the service computes its request hash from the latest onboarding revision and complete evidence-derived plan payload. Repeating the visible request later is therefore not necessarily the same request. Accept, modify and skip instead use optimistic `expectedRevision`; every accepted decision increments one plan aggregate and appends one immutable revision.

A browser can lose the response after PostgreSQL commits. Calling generation again may conflict after evidence changes or obscure a legitimate no-op. Calling a decision again with the old revision will fail, but presenting that conflict as recovery is poor authority handling and can overwrite user understanding of a concurrent update. Page-owned substitutions should remain reviewable without becoming a persisted replay command.

## Decision

All four weekly-plan writes use `reconcile_required` after any ambiguous network, retryable service or unexpected adapter failure. An explicit non-retryable server refusal is terminal for the current attempt.

| Operation                | Retained foreground evidence                        | Successful reconciliation                                                                | Prohibited behavior                                      |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Generate/regenerate week | Requested Monday; same-week base ID/revision if any | Exact owner-visible week exists; load its authoritative projection without another write | Blind `POST`, persisted request, claiming causality      |
| Accept plan              | Plan ID/base revision and decision                  | Same ID, exactly base + 1 and `accepted` status                                          | Blind `PUT`, skipping a divergent revision               |
| Save substitutions       | Base snapshot and activity/option selections        | Same ID, exactly base + 1, `modified` status and every submitted selection               | Losing draft choices, treating them as background intent |
| Skip week                | Plan ID/base revision and decision                  | Same ID, exactly base + 1 and `skipped` status                                           | Blind `PUT` or interpreting skip as user failure         |

- The read boundary is the authenticated `GET /plans/weekly` projection. It carries current content, revision, status, freshness and active session links.
- Generation reconciliation is deliberately non-causal. An exact week proves what the service currently owns, not that the lost response alone created it. A same revision may be the legitimate same-evidence no-op; a newer projection is loaded but not attributed to the interrupted request.
- Decision reconciliation is exact because a successful decision must create the next revision. `modified` additionally matches every submitted activity/option selection. A matching status at a later revision is not accepted as this request's result.
- A base revision still current means no success evidence. The uncertain attempt ends without replay and a new explicit confirmation is required.
- A different revision/status is a concurrent authority state. The draft remains visible until the user chooses to load the projection; the client never automatically overwrites it or repeats the decision.
- Pending keys, base snapshots and substitutions live only in page memory. No plan request is written to application storage, offline queues or a background worker.
- While unresolved, every competing plan-write callback is disabled through explicit `aria-disabled` and guarded pointer/keyboard activation. Only read-side reconciliation or terminal dismissal remains live.

## Consequences

The Week Fold can recover a committed-but-unread plan write without duplicate versions or false success. A user can still see which substitution they attempted while the page checks authority. The price is that an absent or divergent state requires another explicit decision; this is intentional because the current API exposes no durable client-operation receipt for decisions.

Two real-service Playwright scenarios abort browser responses only after the API returns 201/200. They prove one generation write recovers v1, one modification write recovers v2 with the chosen substitution, and one skip write recovers v3. The proof exercises local H5, NestJS and PostgreSQL. It does not establish radio-transition behavior, multi-device timing or WeChat accessibility.

The added Week Fold recovery surface increases measured H5 total/largest async JavaScript to 2,469,269/198,650 bytes and WeApp total to 865,205 bytes. H5 entry, WeApp vendor and largest WeApp page remain 318,996, 18,915 and 42,976 bytes. Budgets move narrowly to 2,470,000/199,000 H5 and 866,000 WeApp while entry/vendor/page ceilings stay fixed.
