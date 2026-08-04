# ADR-0033: Bounded record-evidence plan freshness

Date: 2026-08-04

Status: accepted

## Context

ADR-0031 made profile revision and eligibility drift visible before a weekly-plan action, but intentionally ignored later records. Comparing `dashboardGeneratedAt`, workout counts, meal counts or raw timestamps would make almost every normal log entry invalidate the week. Conversely, ignoring recovery changes could leave a plan generated under the conservative missing/below-60 rule looking current after the evidence used by `deterministic-v1` crossed its actual scheduling boundary.

The persisted plan already contains the generation-time readiness score and recent-record summary. The policy therefore needs to represent planning impact, remain understandable and versioned, preserve old snapshots, and be enforced again on writes rather than relying on client refresh timing.

## Decision

1. Introduce evidence policy `planning-impact-v1`. Its only input is the readiness value already consumed by `deterministic-v1`, classified as `missing`, `conservative` below 60, or `standard` at/above 60. The transparent fingerprint is `planning-impact-v1:readiness-{band}`; it is a versioned rule identifier, not a secret or cryptographic integrity claim.
2. Workout count, meal count, active minutes, active days and exact readiness movement inside one band remain visible evidence but do not invalidate a plan. A new workout or meal therefore does not churn the weekly aggregate unless a future engine version explicitly uses it as a scheduling rule.
3. Add `evidence_changed` to the server freshness projection. It reports only `recovery_added`, `recovery_expired` or `recovery_threshold_crossed`, freezes accept/modify and AI explanation, preserves skip and recommends regeneration. It does not expose raw health values or present the transition as diagnosis.
4. For eligible profiles, the list route computes one current dashboard per request and compares every matching-revision plan with it. Profile/eligibility states retain precedence, so evidence detail never weakens an existing safety hold.
5. Accept/modify and AI explanation recompute the comparison at the server. Alternate or stale clients receive `409 plan_evidence_changed` with the bounded fingerprints/reason. Skip remains available.
6. Generating the same week returns the existing revision when both onboarding revision and evidence fingerprint match. A material profile or evidence change rebuilds the same plan ID as a new draft revision and appends immutable `generated` history.
7. New API outputs require policy/fingerprint fields. Historical JSONB plans and revision snapshots are upgraded only at the database read boundary and validated before exposure; no destructive migration rewrites old evidence.
8. AI explanation context continues sending only the original minimized seven evidence fields. The freshness policy metadata is an authorization/read concern and is not forwarded to the model worker.

## Consequences

- Normal training and food logging no longer creates false stale-plan noise, while a recovery transition that can actually alter session count, duration or intensity is visible before commitment.
- The policy is deliberately coarse and coupled to `deterministic-v1`. Any future engine that uses workload, adherence or nutrition evidence must introduce a new policy version and regression matrix rather than silently widening this fingerprint.
- Each eligible list request performs one additional owner-scoped dashboard read. It does not perform one evidence query per plan.
- Fingerprints make the rule reproducible but do not replace optimistic revision checks, schema validation, immutable history or deterministic safety limits.

## Alternatives rejected

- Hash the entire dashboard snapshot: stable-looking but would invalidate on timestamps and unrelated counters while hiding why.
- Persist a mutable stale flag: duplicates current records, can drift and pollutes immutable plan history with a transient projection.
- Treat every new workout or meal as material: high interruption without a corresponding `deterministic-v1` behavior change.
- Send the expanded evidence object to AI: unnecessary data widening for an explanation that remains bound to the already generated plan.
