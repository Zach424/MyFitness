# Iteration 004 — Body and recovery record lifecycle

Date: 2026-07-18

State: complete for the authenticated manual-measurement loop

## 1. Scope

Re-anchor on the smallest trustworthy daily-data loop after identity/onboarding: let an authenticated adult create, read, correct, audit, trend and remove manual body/recovery measurements through the same H5/WeApp client and real PostgreSQL API.

Success criteria:

- All nine existing measurement contracts are recordable with matching units, IANA timezone and occurrence time.
- Create is idempotent; edit/delete require the current revision and never silently overwrite a concurrent state.
- Every accepted state has an immutable owner-scoped history snapshot; deleted records leave normal lists but retain audit history.
- Cross-user list, history and mutations do not reveal ownership.
- Mobile and wide H5 expose deliberate empty/loading/success/edit/history/delete states and build on the WeApp path.
- Contract/unit, PostgreSQL integration, production builds and real-browser lifecycle tests pass.

Rollback boundary: one additive migration introduces `deleted_at`, a user foreign key and a cascading revision table. No public deployment, irreversible hard deletion, AI estimate UI, device import or real user data enters scope. Browser fixtures are deleted by exact development identity after each test.

## 2. Changes made

- Extended shared contracts with update payloads, record IDs, expected-revision headers, lifecycle actions and strict history responses; lightweight constants remain available through a client-safe package subpath.
- Added migration `0003_health_record_lifecycle.sql`: current records now reference users and support soft deletion; `health_record_revisions` stores constrained snapshots with unique record/revision pairs and backfills existing states as `created`.
- Reworked the NestJS service so create/update/delete plus history insertion share transactions. Lists omit deleted rows, history survives soft deletion, stale versions return `409`, and other users receive `404`.
- Added `PUT`, `DELETE` and `GET .../history` operations to the controller and regenerated committed OpenAPI. H5 CORS now explicitly permits both idempotency and expected-revision headers.
- Generalized the Taro authenticated request helper for GET/POST/PUT/DELETE while retaining one-time 401 session renewal.
- Added a shared H5/WeApp record page with body/recovery tabs, metric-specific hints, unit selection, number and 1–5 score inputs, idempotent save, optimistic edit, deliberate delete confirmation, recent ledger, audit drawer and a seven-entry trend.
- Connected the Today “身体”“恢复” quick actions and “记录” navigation to the real page.
- Added pure record-page modeling/validation tests and PostgreSQL/browser lifecycle coverage. ADR-0004, architecture, health model, design review, roadmap and status now record the chosen boundary.

Implementation method: HTTP contracts reject malformed combinations; deterministic domain functions normalize units; PostgreSQL repeats safety constraints. The service keeps a current row for fast product reads and appends full snapshots in the same transaction. The UI retains occurrence time during correction, shows server revision state, and never presents an empty chart as analysis.

Design impact: the page extends the paper/mineral/juniper logbook into a responsive ledger. Physical measurements use large monospaced values; subjective recovery uses five equal score tiles. Revision and source are readable text, not color-only status. On mobile history rises as a sheet; wide H5 keeps the recent ledger in a sticky secondary column.

## 3. Validation evidence

- `pnpm test`: 10 files and 34 unit/contract/model tests passed, including lifecycle schema rules, database-enum drift, record-draft unit/range handling and H5 CORS preflight headers.
- `pnpm typecheck`: contracts, domain, design tokens, client and API passed.
- `pnpm test:integration`: 2 files and 8 PostgreSQL tests passed. Measurement coverage creates/replays, normalizes lb→kg, rejects changed idempotency, replaces at revision 1, rejects a stale edit, denies cross-user operations, reads ordered snapshots, soft-deletes, excludes from lists and retains three history versions. PostgreSQL still independently rejects a confirmed AI estimate.
- `pnpm --filter @myfitness/api openapi:generate`, `pnpm build:api`, `pnpm build:h5`, `pnpm build:weapp` and `pnpm format:check`: passed. H5 retains the known non-blocking 302 KiB base-entry budget warning; record code is route-chunked.
- `pnpm test:e2e`: 4 Chromium scenarios passed against the production H5 build, NestJS API and PostgreSQL: two onboarding scenarios plus mobile record lifecycle and wide record hierarchy. Browser error arrays were empty.
- Browser lifecycle response sequence: `POST 201`, `PUT 200`, history `GET 200`, `DELETE 204`; the final page returned to the body empty state. Each fixture user and cascaded records/revisions were removed by exact identity.
- Visual evidence: [mobile revision history](../../output/playwright/iteration-004-records-mobile.png) and [wide responsive ledger](../../output/playwright/iteration-004-records-wide.png).

Browser review found a platform boundary that supertest did not: the new `x-expected-revision` delete header triggered CORS preflight, but the API allowlist only contained the earlier idempotency header. Adding it and rerunning the actual browser closed the request. The review also scoped assertions to the routed record page because Taro keeps the prior page DOM mounted during navigation.

## 4. System status update

- Client: Today shell, adult onboarding and body/recovery record lifecycle operate on one Taro H5/WeApp codebase. Today timeline values remain fixtures.
- Identity/API: local server-owned sessions, onboarding and measurement create/list/replace/delete/history are operational. Verified production identity and rate/abuse controls remain.
- Data/domain: nine body/recovery metrics have canonical conversion, range rules, idempotency, optimistic concurrency, soft deletion and immutable snapshots. Workout, nutrition, photos and plan versions remain dedicated future schemas.
- Privacy/safety: AI estimates still cannot become confirmed facts at contract or database boundaries. Soft delete is not a claim of privacy erasure; export/deletion/retention workflows remain.
- Testing: 34 unit/contract/model, 8 real-PostgreSQL integration and 4 production-browser E2E tests. Formatting, type checks, API/H5/WeApp builds and OpenAPI generation pass.
- Deployment: Docker PostgreSQL, API and H5 preview are reproducible locally. No shared staging, production identity, secrets platform, monitoring or public endpoint exists yet.

This round completes the first trustworthy record loop without claiming offline completeness, production authentication, medical interpretation or privacy erasure.

## 5. Risks / open issues

- Stale edits return a safe `409`, but the client currently displays the message rather than offering a reload/compare/merge flow.
- Loading, empty, validation and server-error states exist; true network-offline queuing/retry and idempotency persistence across an app restart remain open.
- Manual records are confirmed by design. Candidate/confirmed visual review waits for an actual AI/import proposal instead of a fake switch.
- Occurrence time is captured as “now” for new entries and preserved on edit; backdated entry and explicit timezone selection are not yet UI controls.
- Snapshot history lacks actor/reason fields because the only mutation actor is the authenticated owner. Imports and admin correction must not ship before adding them.
- Soft deletion retains sensitive snapshots. Public privacy erasure requires policy, scheduled purge, provider deletion and backup evidence in iteration 11.
- 390 px and 1440 px are reviewed; 320 px, large text, keyboard traversal, reduced motion and complete offline states remain design gates.
- The Taro H5 base entry remains about 302 KiB versus webpack's 244 KiB recommendation; CI bundle budgets and deeper vendor splitting remain.

Experience captured: concurrency semantics belong in both API shape and storage transaction; a UI-only revision label is not protection. Snapshot tables should repeat fact/estimate constraints or history becomes a loophole. Cross-origin custom headers need browser-level verification even when controller integration tests pass. Taro route navigation can retain hidden prior-page text in the DOM, so E2E assertions should scope to the active view. Reusing an idempotency key only until a successful create makes user retries safe without merging distinct drafts. Test cleanup now captures the outgoing development subject before navigation so even a timed-out/closed page can be cascade-cleaned; local-storage lookup remains only a fallback.

## 6. Next step

Primary: Iteration 005 will implement workout recording. It will define exercise/set/rest contracts and migrations, repeat-last-workout interaction, in-session corrections, deterministic volume calculations, authenticated history, H5/WeApp builds and mobile/wide E2E evidence.

Deferred candidates:

- Nutrition/manual portion records and macro summaries.
- Real Today aggregation and the deterministic plan engine.
- AI explanation, photo assistance, verified production identity and public deployment.

They remain sequenced behind complete non-AI record domains so planning and AI are grounded in explicit, reversible user evidence.
