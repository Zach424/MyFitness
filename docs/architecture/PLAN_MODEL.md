# Weekly plan model

Status: implemented as `deterministic-v1` in iteration 008; bounded record-evidence freshness added in iteration 035; explicit plan-to-workout links added in iteration 036; stable revision-history pagination added in iteration 049; authority-aware plan-write recovery added in iteration 058

## Purpose and boundary

A weekly plan turns the user's current onboarding constraints and confirmed dashboard evidence into a small, reviewable set of activities. It is general fitness guidance for adults, not diagnosis, rehabilitation, treatment, or an individualized clinical prescription.

Public guidance from the [WHO](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity), [CDC](https://www.cdc.gov/physical-activity-basics/adding-adults/index.html), and [Chinese Nutrition Society](https://dg.cnsoc.org/article/04/K7tlcs-UQh67DBC5XY1Jqw.html) provides conservative context. The engine does not claim that a public population target is an appropriate personal target, and it does not prescribe an energy deficit, calorie ceiling, or nutrient grams.

## Ownership and versions

```text
user
  └─ weekly_plan (one current aggregate per week start)
       ├─ content JSON validated by the shared contract
       ├─ onboarding revision + versioned planning-impact evidence fingerprint
       ├─ current status and revision
       ├─ server-computed freshness projection (read response only)
       ├─ weekly_plan_revisions (immutable generated/modified/accepted/skipped snapshots)
       └─ plan_workout_links (explicit, revision-bound, independently closable relationships)
```

`weekly_plans` is indexed and unique by `(user_id, week_start)`. The current content is stored as JSONB because the client reads and decides on the plan as one aggregate, while the stable ownership, week, revision, status, engine version and idempotency fields remain relational. Every JSON document is validated by Zod at the API boundary and every accepted transition is copied into `weekly_plan_revisions`.

`GET /plans/weekly/:planId/history` returns strict `{ planId, items, nextCursor }` pages with a 20-row default and 50-row maximum; Week Fold requests 10 at a time. The opaque versioned cursor contains only plan UUID and positive revision. The route UUID, authenticated owner and exact anchor revision must agree before the query continues with `revision < anchorRevision ORDER BY revision DESC LIMIT limit + 1` over `weekly_plan_revisions_user_plan_idx`. Newer decisions or regeneration do not enter an already issued older suffix, while a fresh head request sees them. Missing/cross-owner plans remain concealed as `404`; malformed, cross-plan or missing-anchor cursors return `400`. Historical snapshots still pass legacy evidence normalization and full plan-schema validation before display.

## Deterministic-v1 generation rules

- The week starts on Monday and always contains seven explicit days.
- Activities are scheduled only on availability days declared in onboarding.
- Beginner plans contain at most two sessions, intermediate plans three, and advanced plans four.
- Missing or below-60 recovery evidence limits the plan to at most two easy sessions. Recovery is supporting evidence, not a medical score.
- Selected dates are spread across the available week rather than stacked together.
- Session duration is bounded by experience and recovery evidence; no session is marked vigorous.
- Strength sessions use warm-up, squat, hinge, push, pull and core roles. Alternatives are limited to bodyweight or equipment the user said is available.
- Each activity exposes a stable selected option plus safe substitutions. A changed choice creates a new plan revision; it does not rewrite old history.
- Nutrition focuses are qualitative: regular meals, food variety, preference-compatible protein choices and hydration. No calorie or gram prescription is generated.
- Every output includes human-readable reasons, its input evidence snapshot, the onboarding revision, and `deterministic-v1`.

## Safety and lifecycle

Generation requires completed onboarding and blocks users whose current eligibility requires professional clearance. The API performs the same eligibility and onboarding-revision checks again before `accept` or `modify`; a plan generated before a risk/profile change therefore cannot be adopted silently.

`GET /plans/weekly` evaluates the latest current profile and, only for an eligible profile with plans, one current dashboard. It attaches a non-persisted freshness projection to every returned plan. Matching profile revisions and evidence fingerprints are `current`; a different eligible revision is `profile_changed`; a current professional-clearance block is `eligibility_blocked`; a defensive missing-profile case is `onboarding_required`; and a planning-impact recovery transition is `evidence_changed`. The projection includes literal permissions: only `current` may accept/modify or request a new AI explanation, while every state may be skipped. This read model does not alter the plan aggregate or immutable revision history.

`planning-impact-v1` fingerprints the same readiness boundary the engine actually uses: missing, conservative below 60, or standard at/above 60. Exact score movement inside a band and changes to workout/meal/activity counters do not mark the plan stale because they do not change `deterministic-v1` output. Missing-to-present, present-to-expired and below/above-60 transitions carry bounded human-readable reasons. The fingerprint is a transparent policy key, not a medical assessment or cryptographic hash.

The client refreshes the projection on first entry, Mini Program page show, visible H5 focus and an explicit user action. A stale transition resets unsaved substitutions and pending AI consent, hides an old explanation as current, freezes unsafe actions and shows either regeneration or profile review. The server checks remain authoritative if a client misses or races a refresh.

When the onboarding revision or planning-impact evidence fingerprint changes, generating the same week rebuilds the same plan ID as a new draft revision with the latest constraints. A same-band record change is a no-op and returns the existing revision. `skip` remains available even when eligibility or evidence later changes so the user is never trapped in an actionable plan state.

Client decisions use optimistic `expectedRevision` checks:

- `modified` applies only valid activity substitutions and stores the complete resulting snapshot.
- `accepted` preserves the reviewed content as a new immutable revision.
- `skipped` records the decision and optional note without implying failure.
- A stale decision returns `409`; a missing/blocked profile returns `422`.

### Ambiguous plan-write recovery

The client does not treat a transport exception as proof that generation or a decision failed. It also does not blindly reuse the generation key: the service request hash contains the current onboarding revision and complete evidence-derived payload, so a later retry with changed evidence can correctly conflict even when the visible week-start input is unchanged.

- Before generation, Week Fold retains only the requested Monday and the visible base plan ID/revision when that same week already exists. After an ambiguous response it reads `GET /plans/weekly`, finds the exact week and adopts that projection without another `POST`. The same revision is a valid no-op outcome when planning-impact evidence did not change; a newer revision is loaded as authority, not described as proof that a particular lost response caused it.
- Before `accept`, `modify` or `skip`, the page retains the exact base plan snapshot, decision and page-owned substitution selections in memory. It never persists the request or queues a replay.
- A decision is recovered as successful only when the owner-visible plan has the same ID, exactly `base revision + 1`, the requested status and, for `modified`, every submitted activity/option selection. The page then reloads freshness, links and immutable history.
- If the server remains at the base revision, the page reports that there is no success evidence, ends the unknown attempt and requires a fresh explicit decision. If the server has another revision/status, the page keeps the draft visible until the user chooses to load the current projection; it never overwrites the concurrent version.
- While authority is unresolved, generation, freshness refresh, substitution, adoption and skip callbacks are blocked for pointer, Enter and Space and publish `aria-disabled`. The only live action is the foreground server-state read or terminal dismissal.

Real local API/browser fault injection commits generation, modification and skipping before aborting the corresponding browser response. Reconciliation recovers v1, v2 and v3 respectively and request counters prove one write per intent. This proves the local HTTP/PostgreSQL behavior, not real radio loss or WeChat-device behavior.

## Explicit plan-to-actual reconciliation

A plan session becomes `recorded` only when its owner explicitly selects one workout. `plan_workout_links` binds the exact plan ID, plan revision and session date to the exact workout ID and workout revision selected at that moment. Composite owner foreign keys and partial unique indexes prevent cross-user links, two active workouts for one exact session revision, or one workout from satisfying multiple active sessions.

Creation is allowed only for the current `accepted` plan revision with current profile, eligibility and planning-impact evidence, and for the current non-deleted workout revision. The selected date must contain a session in that plan revision. Draft, modified, skipped, stale, empty-day and cross-owner attempts fail at the server even if another client bypasses the H5 controls.

The relationship does not mutate either source aggregate. If the workout is edited later, the read model reports both the originally bound `workoutRevision` and the `currentWorkoutRevision`; if the plan is regenerated, the old link remains attached to the old plan revision and is not silently migrated. User unlink and workout soft deletion close the link with a reason, timestamp and incremented link revision rather than erasing it. All rows are included in the owner export and removed by account erasure.

`GET /plans/weekly` projects active links. The Week Fold uses a check mark only for an exact current-revision link, and Today shows one accepted current session as `planned` or `recorded`. Neither surface compares titles, dates, duration or exercises to infer adherence. A link is an owner-confirmed association, not a quality score or load-adaptation signal.

## Known limitations

- The rules are explainable but have not been clinically validated or evaluated against user outcomes.
- Exercise and food choices use a small built-in starter set rather than a licensed, localized catalog.
- Evidence freshness is intentionally coarse and uses only the current engine's recovery boundary. Explicit links are visible but workload/adherence/nutrition changes still do not adapt a week.
- There is no plan-to-workout draft handoff; users first save an actual workout and then explicitly choose it from the plan.
- No language model, photo analysis, device data, injury assessment, progressive overload, or adaptive energy model participates in this version.

Any future AI layer must produce the same structured plan contract, cite the evidence it used, pass deterministic validators, and remain a proposal until the user explicitly accepts it.
