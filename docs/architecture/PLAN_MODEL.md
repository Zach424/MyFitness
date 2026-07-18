# Weekly plan model

Status: implemented as `deterministic-v1` in iteration 008

## Purpose and boundary

A weekly plan turns the user's current onboarding constraints and confirmed dashboard evidence into a small, reviewable set of activities. It is general fitness guidance for adults, not diagnosis, rehabilitation, treatment, or an individualized clinical prescription.

Public guidance from the [WHO](https://www.who.int/europe/news-room/fact-sheets/item/physical-activity), [CDC](https://www.cdc.gov/physical-activity-basics/adding-adults/index.html), and [Chinese Nutrition Society](https://dg.cnsoc.org/article/04/K7tlcs-UQh67DBC5XY1Jqw.html) provides conservative context. The engine does not claim that a public population target is an appropriate personal target, and it does not prescribe an energy deficit, calorie ceiling, or nutrient grams.

## Ownership and versions

```text
user
  └─ weekly_plan (one current aggregate per week start)
       ├─ content JSON validated by the shared contract
       ├─ onboarding revision + evidence snapshot
       ├─ current status and revision
       └─ weekly_plan_revisions (immutable generated/modified/accepted/skipped snapshots)
```

`weekly_plans` is indexed and unique by `(user_id, week_start)`. The current content is stored as JSONB because the client reads and decides on the plan as one aggregate, while the stable ownership, week, revision, status, engine version and idempotency fields remain relational. Every JSON document is validated by Zod at the API boundary and every accepted transition is copied into `weekly_plan_revisions`.

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

When the onboarding revision changes, generating the same week rebuilds the same plan ID as a new draft revision with the latest constraints. `skip` remains available even when eligibility later becomes blocked so the user is never trapped in an actionable plan state.

Client decisions use optimistic `expectedRevision` checks:

- `modified` applies only valid activity substitutions and stores the complete resulting snapshot.
- `accepted` preserves the reviewed content as a new immutable revision.
- `skipped` records the decision and optional note without implying failure.
- A stale decision returns `409`; a missing/blocked profile returns `422`.

## Known limitations

- The rules are explainable but have not been clinically validated or evaluated against user outcomes.
- Planned activities are not yet linked to completed workout records, so adherence is not inferred.
- Exercise and food choices use a small built-in starter set rather than a licensed, localized catalog.
- The page can discover a newly stale plan only when it regenerates or submits a decision; proactive stale labeling is future work.
- No language model, photo analysis, device data, injury assessment, progressive overload, or adaptive energy model participates in this version.

Any future AI layer must produce the same structured plan contract, cite the evidence it used, pass deterministic validators, and remain a proposal until the user explicitly accepts it.
