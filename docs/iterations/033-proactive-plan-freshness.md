# Iteration 033 — Proactive weekly-plan freshness

Date: 2026-08-04

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 032 made workout completion server-authoritative. The next bounded local risk was plan timing: accept/modify and AI endpoints rejected a plan after profile or safety changes, but the Week Fold could still look current before that failed action.

This round makes revision/eligibility drift visible before commitment. Success requires the server to project freshness without rewriting the plan or history; the shared contract to make permissions impossible to contradict; the H5/WeApp client to check on entry, page show, visible H5 focus and manual request; stale state to explain the exact recovery, discard unsaved substitutions, disable accept/modify and AI explanation, preserve skip; regeneration to restore a current projection; and focused, full, dual-build and real-browser state checks to pass.

The round does not invalidate plans after every workout/meal record, persist a stale flag, expose risk flags in the list, diagnose safety answers, rewrite old AI/history evidence, add an external provider or claim clinical validation.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts/src/plan.ts` adds a discriminated freshness union and a list-only weekly-plan projection. Literal permissions bind each state to safe actions.
- `apps/api/src/plans/plans.service.ts` loads current onboarding once, derives four states and attaches the projection without mutating stored aggregates or revision history.
- `apps/client/src/lib/api.ts` consumes the projected list item while generation and decision responses keep the stable `WeeklyPlan` contract.
- `apps/client/src/pages/plans/plan.model.ts` creates known-current projections after successful generation/action and owns the human freshness explanation.
- `apps/client/src/pages/plans/index.tsx` refreshes on initial load, Taro page show, visible H5 focus and manual request; it resets drafts on authority change and gates substitution/adoption/AI actions from server permissions.
- `apps/client/src/pages/plans/index.scss` adds the misaligned revision seam, folded-corner stale state, responsive recovery action and disabled-control treatment within the existing Week Fold language.
- contract/client tests, PostgreSQL plan integration coverage and committed OpenAPI exercise the new read model.
- ADR-0031, plan/API models, design review, roadmap, README and project status record the decision and limitations.

Technology remains TypeScript strict mode, Zod discriminated contracts, NestJS/PostgreSQL, Taro 4/React and Vitest. No dependency, migration, dataset, external repository or paid API was needed: freshness is a current-owner projection over existing first-party evidence.

## 3. Implementation method

### Project current authority instead of storing another flag

The service maps the immutable plan evidence revision against one current onboarding read. An eligible match is `current`; an eligible mismatch is `profile_changed`; a professional-clearance state is `eligibility_blocked`; missing onboarding is a defensive `onboarding_required`. All states carry the same check timestamp and the plan evidence revision.

The schema uses four strict discriminated objects rather than independent booleans. A blocked state cannot accidentally parse with `canAcceptOrModify: true`; `canSkip` is literally true in every branch. The list adds this projection, while generation, decisions, AI input and immutable snapshots remain the original aggregate shape.

### Refresh at lifecycle boundaries and retain the server backstop

The client keeps plan content and freshness as separate state. First entry loads both; `useDidShow` covers Mini Program/page navigation; H5 focus/visibility covers returning from another tab; “检查版本” provides explicit recovery. Checks are throttled and de-duplicated. If the server returns a new revision or freshness state, the current plan ref, saved draft, pending AI consent and permissions move together, so a dirty substitution or earlier checkbox state cannot survive a stale transition.

UI gating improves explanation but does not authorize. Existing server checks still reject races on decision and AI routes. A successful generation is locally projected as current because that server action already loaded eligible current onboarding; stale skip preserves its stale projection because skipping does not make old evidence current.

### Make the warning part of the Week Fold

The stale panel shows the evidence seam before the action. Profile drift offers “按最新资料重排本周”; eligibility and missing-profile states route to the existing private profile. The plan stays readable and “本周暂不采用” remains enabled. Old AI history remains in history but is not rendered as the current explanation.

## 4. Validation evidence

- Focused contract/client-model validation passed 2 files / 6 tests. It proves the discriminated schema rejects contradictory permissions and the client copy distinguishes current/profile-changed states.
- Focused PostgreSQL plan integration passed 1 file / 3 tests. It generates at profile v1, updates through the onboarding API to v2, observes `profile_changed`, regenerates the same aggregate as current v2, changes the safety answer to observe `eligibility_blocked`, verifies accept is rejected and verifies skip still succeeds.
- Strict TypeScript passed across all six product/shared workspaces.
- The committed OpenAPI document was regenerated from the current application graph.
- In-app H5 browser validation observed a current v1 plan, then after a controlled local profile revision and API restart rendered `PLAN v1 → PROFILE v2`. DOM inspection verified adoption and substitution controls were disabled, skip remained enabled and the AI generator was disabled. The Taro dependency warning iframe continued to intercept product clicks in the development build, so browser regeneration was not claimed; the API integration supplies that recovery proof.
- Repository-wide validation passed 43 files / 180 unit tests and 12 files / 50 integration tests. Production H5 and WeChat Mini Program builds succeeded with the registered Taro dynamic-import/cache warnings, H5 entry 305 KiB/large route chunks and WeApp vendor 417 KiB warnings. No external service was involved.

## 5. Problems found and experience captured

- A server can protect writes and still provide poor timing. Projection plus the original write guard separates early explanation from final authorization.
- Storing `stale` would have made current profile state compete with immutable plan evidence. Read projections are the safer fit for time-sensitive comparisons.
- Independent permission booleans are easy to contradict. A discriminated union makes safety policy part of parsing, not only UI convention.
- Successful skip does not refresh plan evidence. Preserving the stale projection after skip avoids falsely implying that a lifecycle decision rebuilt the plan.
- The first browser reload still reached the iteration-032 API process and a cached 304 response. Restarting the exact local API code produced the projected state; process/code identity must be checked before diagnosing client logic.
- The known Taro video-component warning lives in an iframe and visually intercepts clicks in development. DOM state and integration recovery were recorded separately instead of overstating a browser flow.
- Profile/eligibility revision is a stable invalidation key; dashboard generation time is not. Treating every new dashboard timestamp as stale would create permanent churn, so record-evidence invalidation remains an explicit future policy risk.

## 6. Global state review, remaining risks and next step

The project no longer waits for a failed plan decision to disclose profile or eligibility drift. Current plans, changed-profile plans and safety-held plans have server-owned, user-readable action boundaries; history remains immutable and skip remains available.

Remaining risks include record-evidence freshness semantics, starter catalogs, real provider/cloud custody, bundle size, system large text, keyboard/screen-reader coverage, real WeChat/OIDC proof and telemetry ownership. Iteration 034 should follow the existing roadmap: run 320 px, system large-text and keyboard-only checks across critical H5/WeApp flows, fix the highest-impact failures and enforce measured bundle budgets without hiding Taro warnings. Owner-operated cloud and provider work remains parked but mandatory before beta.

## 7. References

- [Iteration 032 archive](032-server-authoritative-workout-status.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [ADR-0031](../architecture/decisions/0031-server-projected-plan-freshness.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
