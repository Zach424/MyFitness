# Iteration 035 — Bounded record-evidence plan freshness

Date: 2026-08-04

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Iteration 033 made profile/eligibility drift visible, but new records were intentionally excluded because timestamps and counters change on normal logging. The bounded critical-path question for this round was whether a generated week still reflects the evidence rule that actually shaped its sessions—without making every workout or meal interrupt the user.

Success requires a versioned, deterministic and human-explainable fingerprint; normal workout/meal and same-band recovery changes to remain no-ops; material recovery transitions to freeze accept/modify/AI while retaining skip; alternate clients to fail at the server; same-week regeneration to keep the plan ID and append a new revision; historical JSONB to remain readable without destructive migration; AI context not to widen; OpenAPI, PostgreSQL and production H5 behavior to agree; and all normal repository gates to remain green.

This round does not infer adherence, link a completed workout to a plan, prescribe medical action, change the three-day readiness window, make raw health values public, introduce cloud/API work or claim clinical validation.

During full validation, the production audit newly reported high-severity advisories in Next.js and transitive parser/glob/image packages. Security can interrupt a feature round, so the smallest patched dependency floor was applied and revalidated rather than archiving an obsolete “zero high” claim.

## 2. Structure, technology and design state

Changed boundaries:

- `packages/contracts` defines `planning-impact-v1`, readiness bands, transparent fingerprints, bounded change reasons, required evidence metadata and the exhaustive `evidence_changed` projection. A read-boundary normalizer upgrades legacy evidence while current API output stays strict and OpenAPI-representable.
- `packages/domain` owns fingerprint comparison and reason selection. The deterministic plan builder writes the policy metadata; AI orchestration explicitly selects its original seven minimized evidence fields.
- `apps/api` computes one dashboard for an eligible plan list, projects material evidence drift, rechecks it before decisions and AI explanation, performs same-band generation as a no-op, and regenerates a changed week in place with immutable history.
- `apps/client` keys refresh state by the current evidence fingerprint/reason, renders `PLAN EVIDENCE → CURRENT RECORDS`, uses non-diagnostic copy, freezes unsafe actions and resets stale local drafts through the existing authority-change path.
- OpenAPI, the weekly-plan model, ADR-0033, design review, roadmap, README and project status now describe the same contract.
- The administrator moves from Next 16.2.10 to 16.2.11. Parent-qualified overrides patch `fast-uri`, `js-yaml` and three in-use `brace-expansion` lines; the administrator's unused optional Sharp 0.34 line is removed, while the image-processing API retains Sharp 0.35.3.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, PostgreSQL, Vitest and Playwright. No schema migration, external dataset, paid API, cloud account or sensitive-data expansion was added.

## 3. Implementation method

### Fingerprint only behavior that can change the plan

`deterministic-v1` currently changes session count, duration and intensity only at three recovery states: no score, below 60 and at/above 60. `planning-impact-v1` therefore emits `readiness-missing`, `readiness-conservative` or `readiness-standard`. Exact score changes inside a band and workout/meal/activity counters remain evidence for display, not invalidation inputs.

The comparison emits only `recovery_added`, `recovery_expired` or `recovery_threshold_crossed`. Profile absence, eligibility and profile-revision drift keep precedence. This prevents a new evidence feature from weakening an existing safety hold or leaking risk details.

### Keep read projections helpful and writes authoritative

The list route reads one current dashboard when there is at least one plan and the current profile is eligible. `evidence_changed` has literal false permissions for accept/modify and AI, literal true for skip, and `regenerate` as its only recommended action. Decisions and AI explanation independently recompute the same comparison and return structured `409 plan_evidence_changed`; the client projection is explanation and timing, not authorization.

Same-week generation compares onboarding revision and fingerprint after validating/normalizing the stored plan. If both match, even changed timestamps and counters return the same ID/revision. A material change updates that ID to a new draft revision and stores another immutable `generated` snapshot.

### Preserve old plans and the AI data boundary

A Zod transform was first considered for legacy evidence, but real application assembly failed because transforms cannot be represented in JSON Schema. The final design makes current API fields required and upgrades old JSONB only in `mapPlan`/history read boundaries. Supplied contradictory fingerprints fail validation. No migration rewrites historical truth.

Because the AI plan context had reused the complete plan-evidence schema, adding freshness metadata initially widened the worker request and caused its strict fixture endpoint to reject the payload. The contract now has an explicit minimized AI evidence object, and the domain mapper selects those seven fields. Freshness authorization metadata never enters a model prompt.

### Security-floor interruption

The full audit surfaced current patched versions: Next 16.2.11, Sharp 0.35+, `fast-uri` 3.1.5, `js-yaml` 5.2.2 and patched 1.x/2.x/5.x `brace-expansion`. The administrator uses no `next/image`, so removing Next's vulnerable optional Sharp is safer than forcing an unsupported Sharp minor outside Next's declared range. The API already uses Sharp 0.35.3. After official npm downloads and a clean offline relink, the production graph returned to zero critical/high findings. Nine moderate findings remain confined to the registered Taro build chain.

## 4. Validation evidence

- Focused contract/domain/client validation passed 3 files / 14 tests, covering legacy normalization, contradictory fingerprints/permissions, all three material reasons, same-band no-op and non-diagnostic client copy.
- Strict TypeScript passed across all six product/shared workspaces; repository formatting and generated OpenAPI passed.
- Repository-wide unit validation passed 46 files / 204 tests.
- PostgreSQL integration validation passed 12 files / 51 tests. The plan case proves workout plus meal additions return the original revision, recovery evidence projects `evidence_changed`, accept and AI explanation both return `409`, and regeneration keeps the ID while advancing to v2/current.
- Full H5 browser validation passed 23/23; together with the separate three-case OIDC suite already retained by the repository, the browser inventory is 26. The new 390 × 844 case verifies the alert, non-medical wording, disabled substitution/adoption, available skip and successful v2 regeneration.
- Administrator Next 16.2.11 production build, API build and both Taro production builds passed.
- Client quality measured H5 `1,655,329` total bytes, `312,571` entry bytes and `189,303` largest async JavaScript; WeApp `644,690` total bytes, `18,915` vendor bytes and `39,180` largest page JavaScript. All remain below checked-in budgets with no forbidden validation-runtime markers.
- `pnpm audit:prod` passed with 0 critical / 0 high and 9 moderate production findings. `pnpm why` shows Next 16.2.11, only Sharp 0.35.3 and no administrator Sharp 0.34 line.
- Reviewed browser evidence is `output/playwright/iteration-035-evidence-shift-mobile.png`.

## 5. Problems found and experience captured

- Freshness must follow behavioral dependencies, not whatever data happens to be available. Hashing an entire dashboard would create opaque, high-frequency churn.
- A readable versioned fingerprint can be more useful than a cryptographic digest when integrity is already enforced elsewhere and the product needs to explain a policy boundary.
- Zod transforms are convenient for compatibility but can break JSON Schema/OpenAPI generation. Normalize persisted legacy data at a named storage boundary and keep public schemas explicit.
- Reusing a large domain schema in AI context silently couples future fields to the model data boundary. Minimized contexts need their own strict schema and explicit mapper.
- Production-browser reuse of an old local API can produce a false UI failure after source changes. Exact process/build provenance must be checked before treating the page as evidence.
- Taro custom buttons serialize `disabled=false` as an attribute; browser tests must assert the framework's actual property/value contract instead of native absence semantics.
- Dependency audit results are time-dependent. A full validation performed later the same day can invalidate a previously accurate risk count, so status and lock floors must be refreshed from current evidence.
- On Windows, long-running Taro watch/preview processes can lock dependency links. Stop only verified project process trees, complete installation, validate, and restart the requested preview.

## 6. Global state review, remaining risks and next step

Weekly-plan freshness now covers every input that currently changes deterministic scheduling without turning ordinary records into alerts. Old plans and history remain readable, alternate clients fail closed, and the H5 state gives one safe choice while preserving skip. This is an explainable product rule, not a claim that a three-day subjective recovery band is medically meaningful or outcome-validated.

Remaining risks include explicit plan-to-workout reconciliation, coarse recovery-only adaptation, starter catalogs, real screen readers/WeChat devices, nine moderate Taro build-chain advisories, real provider/cloud custody, telemetry ownership and policy review. Iteration 036 should stay local and create an explicit owner-controlled link between one planned session revision and one completed workout. It must not infer adherence from title or time similarity. External operator work remains parked but mandatory before beta.

## 7. References

- [Iteration 034 archive](034-client-accessibility-and-bundle-hardening.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [ADR-0013](../architecture/decisions/0013-auditable-transitive-security-floors.md)
- [ADR-0031](../architecture/decisions/0031-server-projected-plan-freshness.md)
- [ADR-0033](../architecture/decisions/0033-bounded-record-evidence-plan-freshness.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
