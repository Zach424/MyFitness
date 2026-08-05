# Iteration 049 — Stable weekly-plan history pagination

Date: 2026-08-05

State: implementation and local acceptance complete; hosted exact-SHA CI remains post-commit evidence

## 1. Scope and success standard

Weekly-plan history was the final direct revision query without a server limit. It returned every structured plan snapshot and Week Fold rendered the entire generation/decision trail, so repeated regeneration or decisions could grow one authenticated response indefinitely.

Success requires strict shared query/response contracts; 20-item default and 50-item maximum server pages; stable newest-first revision continuation; a cursor containing no plan content, evidence, note, time or user identifier; route/owner/exact-anchor validation; indexed PostgreSQL execution; legacy snapshot normalization; 10-item progressive Week Fold loading; stable continuation when a new decision is inserted; unchanged freshness/eligibility/AI/safety behavior; mobile browser proof; and measured H5/WeApp artifacts.

This round adds no cloud service, external provider, dataset, migration, plan-generation rule, adaptive prescription, medical claim or calorie target.

## 2. Structure, technology and design state

- The plan contract now exports a typed history query and bounded `{ planId, items, nextCursor }` response.
- The NestJS controller validates/documents strict `limit`/`cursor`; generated OpenAPI records the public shape.
- `PlansService.history` validates plan path, owner and exact revision anchor, then reads the older suffix from the existing owner/plan/revision descending index with `LIMIT limit + 1`.
- The shared API client returns a complete typed page. Week Fold stores the continuation separately, opens with 10 decisions and exposes one explicit accessible older-history action plus terminal state.
- The original plan browser flow advances one aggregate to v11, proves 10 initial entries and expands to the generated v1 snapshot. The original PostgreSQL lifecycle test now proves a concurrent v5 head cannot contaminate the continuation below v3.
- ADR-0047, plan/architecture/API/design/roadmap/README and global status record the same boundary.

Technology remains TypeScript strict mode, Taro 4/React, NestJS 11, Zod 4, parameterized PostgreSQL 18, Vitest and Playwright. No runtime dependency or SQL migration was added.

## 3. Implementation method

### Use immutable revision as the whole continuation order

The common cursor envelope carries only version, plan UUID and positive revision. A continuation first requires the UUID to equal the route, then separately proves the current plan owner and exact immutable anchor. The SQL predicate is `revision < anchorRevision ORDER BY revision DESC LIMIT limit + 1`; the extra row determines whether another page exists without a count query.

A new accepted decision after page one has a larger revision and therefore cannot enter the older suffix. A fresh head request sees it. The existing `weekly_plan_revisions_user_plan_idx` already begins with owner and plan before descending revision, so a redundant migration would add write cost without improving the query boundary.

### Keep audit paging separate from plan semantics

Week Fold requests 10, appends only the disjoint older page and keeps visible history on failure. It does not auto-fetch through scroll or claim an exact lifetime total. Existing generated/modified/accepted/skipped labels, revision/time evidence, snapshot normalization and all freshness, eligibility, AI consent, substitution and safety controls remain unchanged.

### Keep the bundle increase visible

H5 remains below the existing ceilings at 2,444,138 total bytes, 318,996 entry bytes and 206,946 largest async JavaScript. WeApp measures 806,733 total bytes, 18,915 vendor bytes and a 50,338-byte largest page. Only the total ceiling moves from 806,000 to 807,000; vendor/page/H5 ceilings stay fixed. The embedded action-definition editor remains the next measured route split.

## 4. Validation evidence

- Focused weekly-plan contract validation passed 1 file / 7 tests.
- Focused weekly-plan PostgreSQL validation passed 1 file / 5 tests. It proves bounded pages, concurrent new-head stability, fresh-head visibility, exact owner concealment, cross-plan/missing-anchor and strict-query rejection, plus the existing optimistic lifecycle.
- Repository-wide unit validation passed 61 files / 269 tests.
- PostgreSQL integration validation passed 19 files / 62 tests.
- Strict TypeScript, repository formatting, generated OpenAPI, API/H5/WeApp/admin production builds and client forbidden-runtime scanning passed.
- Main browser validation passed 40/40 and dedicated OIDC passed 3/3, for 43 browser cases. The plan flow proves 10 + 1 progressive history and an explicit terminal state.
- Client quality measured H5 `2,444,138` total bytes, `318,996` entry bytes and `206,946` largest async JavaScript; WeApp `806,733` total bytes, `18,915` vendor bytes and `50,338` largest page JavaScript.
- `pnpm audit:prod` retains the zero critical/high gate with nine known moderate Taro build-chain findings.
- Reviewed browser evidence is `output/playwright/iteration-049-progressive-plan-revisions-mobile.png`.

## 5. Problems found and experience captured

- Browser validation starts built artifacts, so source-only changes can appear broken when stale `dist` is reused. Rebuild the exact auth-mode artifact before interpreting UI failures.
- Dev-auth and OIDC H5 builds intentionally differ. Running the OIDC suite against the last dev-auth build correctly fails at the login boundary; rebuilding the OIDC candidate restored 3/3 without changing assertions.
- Structured audit snapshots deserve limits even when current examples are short; repeatable transitions make growth a lifecycle property, not a fixture-count guess.
- A cursor shape is not authorization. Path binding, parent ownership and exact anchor ownership are three separate checks.
- Immutable monotonic revision makes concurrent-head behavior straightforward and testable without timestamps, offsets or total counts.
- Historical normalization belongs before response validation and must not be bypassed by pagination.
- A budget gate did its job by surfacing 1,019 bytes of WeApp growth. Narrowly moving only the exceeded total preserves pressure on the unchanged largest page.

## 6. Global state review, remaining risks and next step

Current record collections and every direct user-facing immutable revision stream are now bounded and progressively reachable. A source audit confirms all six `ORDER BY revision DESC` history queries also apply `LIMIT` and cursor boundaries.

Iteration 050 should move owner action-definition management out of the 50,338-byte workouts page into a dedicated lazy route. It must preserve create/correct/archive/history, snapshot reuse and return-to-workout behavior while producing a measured page reduction. Managed deployment remains parked pending owner-operated account, domain, credentials, custody and telemetry inputs.

## 7. References

- [Iteration 048 archive](048-stable-definition-history-pagination.md)
- [Project status](../PROJECT_STATUS.md)
- [Delivery roadmap](../product/ROADMAP.md)
- [Architecture](../architecture/ARCHITECTURE.md)
- [API contract guide](../api/README.md)
- [Weekly plan model](../architecture/PLAN_MODEL.md)
- [ADR-0008](../architecture/decisions/0008-deterministic-plan-before-ai.md)
- [ADR-0045](../architecture/decisions/0045-stable-revision-history-pagination.md)
- [ADR-0046](../architecture/decisions/0046-stable-definition-history-pagination.md)
- [ADR-0047](../architecture/decisions/0047-stable-weekly-plan-history-pagination.md)
- [Design system review](../design/DESIGN_SYSTEM.md)
