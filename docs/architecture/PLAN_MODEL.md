# Weekly plan model

Status: implemented as `deterministic-v1` in iteration 008; bounded record-evidence freshness added in iteration 035; explicit plan-to-workout links added in iteration 036; stable revision-history pagination added in iteration 049; authority-aware plan/association write recovery added in iterations 058–059; revision-bound non-causal outcome review added in iteration 103; owner-scoped exact historical outcome reads added in iteration 104; dedicated outcome read surface added in iteration 105

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

### Ambiguous association recovery

The create endpoint is tuple-idempotent without a client key: under a transaction lock it returns the existing active link only when plan ID/revision, session date, workout ID and bound workout revision all match. Unlink instead closes one active link only at its expected link revision. Week Fold still reconciles both through `GET /plans/weekly` before offering any new explicit action so the user sees the same foreground authority model.

- Before create, the page retains the exact plan ID/revision, session date and workout ID/revision in memory and renders that intent in the amber authority strip. Recovery succeeds only when one active projected link matches the complete tuple. Another activity link is loaded as a conflict; absence is “no success evidence”, not permission to auto-repeat.
- Before unlink, the page retains the exact link ID/revision and session date. If that ID is still active, there is no success evidence and a fresh explicit unlink is required. If absent, the target is removed from the current view; the client says only that it is no longer active because the projection does not expose whether user unlink, workout deletion or another lifecycle event closed it.
- Reconciliation reloads the exact plan projection and restores the intended session date. It never migrates an old-revision link, infers adherence, rewrites a workout/plan or interprets closure as a training outcome.
- While unresolved, day selection, workout choices, link/unlink, plan refresh, substitution and decisions publish `aria-disabled` and reject pointer/keyboard callbacks. The pending relationship remains visible; no request enters application storage or a background queue.

Real local browser/API fault injection commits one link and one user closure before aborting each browser-facing response. Read-side recovery observes the exact active tuple and then target absence, while request counters remain one create and one delete. This proves local H5/NestJS/PostgreSQL behavior, not real device/radio timing.

## Revision-bound outcome review

Newly generated plans preserve the complete `subjective-recovery-state-v1` snapshot that produced their planning readiness projection. The snapshot includes temporal windows, personal baseline, coverage, confidence, consistency and exact health-record evidence references. The shared contract checks that the persisted state projects to the same nullable readiness score and planning-impact fingerprint. Historical payloads without this field remain readable and are labelled as legacy summaries; the API does not reconstruct them from later records. System-generated factor labels, state labels, notes and each limitation are bounded to 60, 80, 320 and 240 characters respectively. The contract does not truncate or silently repair oversized values; current deterministic output remains compatible, while abnormal persisted content fails closed.

For an exact `accepted` aggregate, `GET /plans/weekly/:planId/history/:revision/outcome` computes a non-persisted `plan-outcome-review-v1` projection. The weekly list intentionally carries only navigation metadata and does not calculate or embed this projection. Its start is the immutable `changed_at` of the exact accepted revision; its scheduled end is exactly seven days later; `observedThrough` is the earlier of that end and the current read time. The read model compares the accepted snapshot with the closest preceding `generated` snapshot by stable activity ID to expose adopted substitutions. It does not infer motivation from notes.

Follow-up evidence is deliberately narrower than a general activity search:

- a workout must retain an active owner-confirmed link to the exact plan revision, and its occurrence must fall after adoption inside the bounded window;
- a recovery observation must be current, non-deleted, `confirmed`, non-AI, one of the four subjective recovery metrics and inside the same window;
- every exposed item retains its aggregate ID/revision, occurrence time and source; up to 100 recovery references are shown while the exact total remains explicit;
- unlinking or deleting removes an item from the current review, while the underlying closed/revision history remains in owner export and audit data;
- the projection separately counts closed/deleted workout links and deleted recovery records inside the exact revision window as withdrawn evidence. These counts explain exclusion without restoring content or contributing to `observed`.

`unknown` means no qualifying follow-up evidence is currently visible; it is not converted to no training, no adherence or no effect. `observed` means only that at least one qualifying record exists. The projection never calculates completion, adherence, benefit, causality or a next-plan adjustment. Its seven-day window and self-selected recording coverage remain unvalidated product heuristics, recorded as R-031.

`GET /plans/weekly/:planId/history/:revision/outcome` recomputes one exact immutable `accepted` revision for its authenticated owner. Missing, non-accepted and cross-owner targets are concealed as `404`; responses are `private, no-store`. The endpoint and current-list projection share the same calculator, accepted/generated snapshot selection, current-fact filters and withdrawal counts.

The weekly-plan page keeps only lightweight navigation for current and historical accepted revisions; it does not retain a full outcome projection or request state. One dedicated outcome page grants the selected `planId` and positive integer revision a short-lived, in-memory read authority. Invalid parameters do not read, initial failure remains unknown and offers an explicit focused retry, and a monotonic generation invalidates results when retrying or unmounting. It does not poll, persist reviews, replay requests in the background or expose raw service errors. H5 query parameters contain plan identifiers but no health content.

## User-confirmed plan experience

`plan_experience_reflections` stores at most one current reflection for an authenticated owner, plan UUID and exact accepted revision. Its value is one of `easier_than_expected`, `about_right`, `not_right_for_me` or `not_sure_yet`; the server fixes the source to `user_confirmed`. No note, AI value, outcome direction or automatic plan input is accepted.

`GET/PUT/DELETE /plans/weekly/:planId/history/:revision/reflection` conceals missing, non-accepted and cross-owner targets as `404`. GET returns an object envelope whose `reflection` is nullable, so a confirmed absence is distinct from an empty transport response. PUT requires `expectedRevision=0` for creation or the exact current revision for correction; a transaction and row lock increment the revision. Correction replaces the previous subjective value rather than retaining an immutable content history. DELETE requires the exact current revision and removes the row.

The dedicated outcome page reads the system outcome and user reflection under separate in-memory authorities. A failed reflection read never becomes an unfilled state and cannot hide a successfully read outcome. The four choices create or correct on explicit activation; deletion requires confirmation. Current reflections participate in privacy inventory and portable export, while owner deletion cascades them. They do not change outcome `unknown`/`observed`, prove adherence/effect/causality, invoke AI or adapt later plans.

## 便携归档结构边界

周计划属于 owner 数据且没有软删除。便携归档包含当前计划、全部不可变 `weekly_plan_revisions`、活动与已关闭 `plan_workout_links`，以及每个精确计划修订的当前体验反思。顶层计划按 owner 唯一 `week_start`，history 按唯一 revision，reflection 按唯一 plan_revision；link 必须按 `(linked_at,id)`，因为多个已关闭关联可以共享时间戳。迁移 0036 提供 `(user_id,plan_id,linked_at,id)` 非部分索引，不依赖只覆盖活动行的部分唯一索引。

`inspectWeeklyPlanShape()` 只返回 revision、各集合计数、UTF-8 字节、时间戳碰撞数和结构布尔，不返回 owner/plan/link UUID 或计划正文。共享 Schema 合法的 7 天、每日至多 8 个活动、每活动至多 6 个选项计划已经让当前 payload 和单条 revision 超过 64 KiB；修订与已关闭关联数量又没有总上限。因此异步来源必须递归拆分 days/session/activities/options、nutritionFocuses、reasons 与 evidence，并让 current/revision 共用兼容规则；history、links 和 reflections 也必须分别分页。本轮只固定形状和总序，尚未输出正文或接入第九协调字段。

其中 `evidence` 不再含无界内部生成标量：factor label、state label、note 和每条 limitation 的字符上限由共享契约固定为 60/80/320/240。测试以 148 条证据引用、四个最大 factor、五条最大 limitation 和多字节中文正文证明整个合法 `planEvidence` 低于 64 KiB，因此后续递归计划来源可以把 evidence 作为有界叶节点。该证明只覆盖当前 `subjective-recovery-state-v1` 合法形状，不放宽其他计划正文，也不替代单元素 PostgreSQL 门禁。

## Known limitations

- The rules are explainable but have not been clinically validated or evaluated against user outcomes.
- Exercise and food choices use a small built-in starter set rather than a licensed, localized catalog.
- Evidence freshness is intentionally coarse and uses only the current engine's recovery boundary. The outcome review is descriptive and does not adapt workload, adherence or nutrition.
- Outcome review is available for current and exact historical accepted revisions, but its seven-day window, actively selected evidence and withdrawal counts cannot establish plan effect or causal attribution.
- A four-choice user reflection is a current self-report, not an effect measure. Correction does not preserve prior subjective content, and the choice set still requires user research.
- There is no plan-to-workout draft handoff; users first save an actual workout and then explicitly choose it from the plan.
- No language model, photo analysis, device data, injury assessment, progressive overload, or adaptive energy model participates in this version.

Any future AI layer must produce the same structured plan contract, cite the evidence it used, pass deterministic validators, and remain a proposal until the user explicitly accepts it.
