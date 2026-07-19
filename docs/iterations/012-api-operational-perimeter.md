# Iteration 012 — API operational perimeter

Date: 2026-07-19

State: complete locally for request correlation, shared abuse limits, dependency health and bounded process metrics

## 1. Scope

Re-anchor the path to a shared deployment at the API entrance. This round intentionally delivers request IDs, a pre-authentication ingress limit, authenticated route policies, Redis readiness, minimal structured logs, protected Prometheus metrics and a tested fail-closed mode. Administrator identity/RBAC, support search/UI, immutable admin audit, durable reconciliation, backup/provider evidence and centralized alert delivery remain separate boundaries. Acceptance requires real Redis concurrency and outage evidence, no direct actor identifiers in Redis/metrics/log labels, full existing regression, operations documentation and one local commit.

## 2. Structure, technology and implementation

- `apps/api/src/operations`: added UUIDv4 request middleware, completion lifecycle observation, stable route templating, shared policy constants, an IP ingress guard, post-authentication route interceptor, HMAC-keyed Redis service, process metrics, internal-token guard and metrics controller.
- `apps/api/src/config.ts`: production now requires Redis URL, rate-key HMAC secret and operations token; proxy trust is an explicit bounded hop count and defaults to zero.
- `infra/local/compose.yaml`: added pinned Redis 8.8.0 on loopback with no persistence, 64 MiB `noeviction` memory and a health check. The API uses the official `redis` 6.1.0 Node client.
- `apps/api/src/health`: split dependency-free `/health/live` from PostgreSQL+Redis `/health` readiness.
- Sensitive AI explanation, photo reservation/upload, privacy export/withdrawal and account erasure routes declare centralized user policies; the development session declares an IP policy. Every other business route receives both ingress and standard actor limits.
- `docs/operations`: added deployment, dashboard, Redis incident, elevated-429, secret-rotation and rollback procedures without claiming a real pager or production owner exists.

Implementation method: middleware establishes correlation before any framework guard and records the final response after every route outcome. The global ingress guard increments `HMAC(IP)` before Bearer authentication so invalid-token database work is bounded. After authentication, the interceptor increments `HMAC(user UUID)` under the route policy. A Lua script performs increment, initial expiry and TTL read atomically, making decisions shared across API processes. Health and internal metrics explicitly skip rate limiting so an outage remains diagnosable, while the operations token remains independent from user sessions.

## 3. Operational design archive

The control surface is machine-first by design. There is no generic administrator dashboard in this round: presenting user search or operational controls before operator identity and audit contracts would turn visual progress into an authorization defect. The memorable structural element is the two-gate request path—`INGRESS → IDENTITY → ROUTE`—with liveness outside dependency failure and readiness inside it. Human-facing output stays limited to request IDs, standard rate headers, actionable Chinese 429/503 copy and no health payloads.

Design and operating evidence:

- [Operations perimeter model](../architecture/OPERATIONS_PERIMETER.md)
- [API operations runbook](../operations/API_OPERATIONS_RUNBOOK.md)
- [ADR-0012](../architecture/decisions/0012-shared-api-operational-perimeter.md)

## 4. Validation evidence

- `pnpm test`: 29 files / 87 tests passed, including generated-ID rejection, bounded metric labels, actor HMAC keys, policy validation and post-auth Redis failure behavior.
- `pnpm test:integration`: 9 files / 31 PostgreSQL/Redis tests passed. Six operations scenarios prove PostgreSQL+Redis readiness, shared atomic count `1..10` across two clients with exactly five admissions, ingress-before-auth execution, correlated headers/429, internal-token metrics and real Redis-unavailable fail-closed behavior with live process health.
- Full workspace typecheck, API/OpenAPI build, H5 and WeApp builds, 7 AI worker tests, 7/7 plan-explanation evals, 8/8 food-photo evals and 19/19 Chromium flows passed. The builds retain the already-registered R-009 size/code-splitting warnings; no paid model call was made.
- `pnpm audit --prod` remains a failed release gate: 20 Taro-chain transitive advisories (1 critical, 3 high, 12 moderate and 4 low) were reported. Redis was not named. R-015 and iteration 013 now make compatibility-tested dependency remediation the immediate next scope.
- Compose health includes PostgreSQL, Redis and fixture AI. Test users, rate keys and private upload roots are checked empty before commit.

## 5. Problems found and experience captured

- A Nest interceptor is after guards. It can enforce per-user quotas but cannot protect an invalid-token database lookup or observe its 401. The correct boundary is two layers: a global pre-auth IP guard plus post-auth route policy, with response lifecycle measurement outside both.
- Request IDs are log input. Accepting arbitrary caller text enables control characters and oversized correlation fields; UUIDv4 validation plus replacement keeps the field useful and bounded.
- Trusting `X-Forwarded-For` without an exact proxy-hop setting lets clients choose another rate bucket. Proxy trust is therefore configuration, not an unconditional middleware flag, and a real forwarded-IP integration test covers it.
- Shared counters must not turn direct users or IPs into a secondary identifier store. HMAC actor keys preserve stable windows without writing the source identifier; rotating the secret intentionally resets active windows and belongs in the runbook.
- Redis outage behavior must be explicit. Per-process fallback looks available but silently removes cross-replica protection, so business traffic fails closed while liveness stays available and readiness fails.
- Metrics cardinality is a privacy and availability constraint. Registered route templates, allow-listed methods and bounded status/policy labels are safe; raw URLs, query strings, request IDs, IPs and users are not labels.
- Iteration 011 incorrectly recorded that H5 and WeApp shared one output directory. Repository blame and current config prove platform-specific `dist-h5`/`dist-weapp` roots existed from iteration 001; the old archive is corrected in this commit, and the actual browser defect was the hidden/overlapped wide profile entry.

## 6. Remaining risks and next step

Metrics are process-local and no central scraper, dashboard, alert delivery or named incident owner is deployed. Fixed windows can burst at a boundary and limits are engineering defaults without real traffic calibration. Redis production topology/TLS/ACL, verified end-user identity, operator identity, RBAC, just-in-time sensitive access and immutable administrator audit remain absent. The production dependency audit also has critical/high Taro-chain findings. Durable AI/photo reconciliation, encrypted object storage, backup restore/provider deletion evidence and legal/release review remain gates.

Iteration 013: remediate the production dependency audit as one controlled compatibility boundary—remove critical/high findings through supported upgrades or narrowly justified overrides, document any lower residual finding, and prove both client targets plus all existing flows before administrator work begins.
