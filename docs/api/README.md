# API contract

The generated OpenAPI 3 document is committed as `openapi.json` so clients, reviewers, and CI can inspect contract drift without starting the service.

Regenerate it after API route or schema changes:

```bash
pnpm --filter @myfitness/api openapi:generate
```

Local routes after `pnpm db:up`, `pnpm db:migrate`, and `pnpm dev:api`:

- API readiness: `GET http://127.0.0.1:3100/v1/health`
- API liveness: `GET http://127.0.0.1:3100/v1/health/live`
- Private Prometheus metrics: `GET http://127.0.0.1:3100/v1/internal/metrics`
- Durable-job aggregate status/drain: `GET/POST http://127.0.0.1:3100/v1/internal/data-operations[/drain]`
- Local-only session: `POST http://127.0.0.1:3100/v1/auth/dev/session`
- WeChat Mini Program code exchange: `POST http://127.0.0.1:3100/v1/auth/wechat/session`
- Local-only administrator session: `POST http://127.0.0.1:3100/v1/admin/auth/dev/session`
- Administrator OIDC exchange: `POST http://127.0.0.1:3100/v1/admin/auth/oidc/exchange`
- Administrator identity/session: `GET .../v1/admin/auth/me` / `DELETE .../v1/admin/auth/session`
- Exact support evidence lookup: `POST http://127.0.0.1:3100/v1/admin/support/users/lookup`
- Administrator audit page: `GET http://127.0.0.1:3100/v1/admin/audit?limit=25&cursor=...`
- Current onboarding: `GET/PUT http://127.0.0.1:3100/v1/me/onboarding`
- Privacy inventory: `GET http://127.0.0.1:3100/v1/me/privacy`
- Portable data export: `GET http://127.0.0.1:3100/v1/me/privacy/export`
- Optional consent withdrawal: `POST http://127.0.0.1:3100/v1/me/privacy/consents/:purpose/revoke`
- Account-erasure intent: `POST http://127.0.0.1:3100/v1/me/privacy/account-deletion-intents`
- Permanent account erasure: `DELETE http://127.0.0.1:3100/v1/me/privacy/account` with intent UUID and `X-Erasure-Intent-Token`
- Secret-gated erasure receipt: `GET http://127.0.0.1:3100/v1/privacy/erasure-receipts/:receiptId` with `X-Erasure-Receipt-Token`
- Lost-response receipt recovery: `POST http://127.0.0.1:3100/v1/privacy/erasure-receipts/recover` with `X-Erasure-Receipt-Token`
- Measurements: `GET/POST http://127.0.0.1:3100/v1/health-records`
- Measurement lifecycle: `PUT/DELETE http://127.0.0.1:3100/v1/health-records/:recordId`
- Measurement history: `GET http://127.0.0.1:3100/v1/health-records/:recordId/history`
- Workouts: `GET/POST http://127.0.0.1:3100/v1/workouts`
- Workout lifecycle: `PUT/DELETE http://127.0.0.1:3100/v1/workouts/:workoutId`
- Workout history: `GET http://127.0.0.1:3100/v1/workouts/:workoutId/history`
- Meals: `GET/POST http://127.0.0.1:3100/v1/nutrition/meals`
- Meal lifecycle: `PUT/DELETE http://127.0.0.1:3100/v1/nutrition/meals/:mealId`
- Meal history: `GET http://127.0.0.1:3100/v1/nutrition/meals/:mealId/history`
- Favorite foods: `GET http://127.0.0.1:3100/v1/nutrition/favorites`
- Favorite lifecycle: `PUT/DELETE http://127.0.0.1:3100/v1/nutrition/favorites/:foodKey`
- Food-photo reservation/list: `POST/GET http://127.0.0.1:3100/v1/nutrition/photo-candidates`
- Food-photo private upload: `POST http://127.0.0.1:3100/v1/nutrition/photo-candidates/:photoId/upload?token=...`
- Food-photo signed preview: `GET http://127.0.0.1:3100/v1/nutrition/photo-candidates/:photoId/preview?token=...`
- Food-photo confirm/delete: `POST .../:photoId/confirm` / `DELETE .../:photoId`
- Today and trends: `GET http://127.0.0.1:3100/v1/insights/dashboard?timezone=Asia%2FShanghai`
- Weekly-plan generation/list: `POST/GET http://127.0.0.1:3100/v1/plans/weekly`
- Weekly-plan decision: `PUT http://127.0.0.1:3100/v1/plans/weekly/:planId/decision`
- Weekly-plan history: `GET http://127.0.0.1:3100/v1/plans/weekly/:planId/history`
- AI plan explanation: `POST http://127.0.0.1:3100/v1/plans/weekly/:planId/explanation`
- AI explanation history: `GET http://127.0.0.1:3100/v1/plans/weekly/:planId/explanations`
- Swagger UI: `http://127.0.0.1:3100/docs`
- OpenAPI JSON: `http://127.0.0.1:3100/docs/openapi.json`

Protected routes require `Authorization: Bearer <opaque-token>`. The local issuer accepts a stable development subject and is disabled in production. The WeChat route accepts only a short-lived Mini Program code, verifies it server-side with `code2Session`, namespaces the returned `openid` by AppID, discards `session_key`, and returns the same seven-day opaque principal shape with `provider` and `isNewUser`. PostgreSQL stores only token hashes. Production enables `wechat` but never `dev`; real credentials/device/domain proof remain deployment gates.

Administrator routes use the independent OpenAPI `adminBearer` scheme and `mf_admin_*` sessions. User and administrator tokens cannot be exchanged or reused across guards. Production OIDC exchange verifies remote JWKS signature, issuer, audience, maximum age and a matching nonce, accepts only pre-provisioned active subjects/roles, and consumes each ID-token hash once. Administrator support lookup requires one exact UUID, ticket reference and enumerated reason; it returns only lifecycle/aggregate/custody evidence. Audit targets are HMAC references and audit rows reject update/delete. The local administrator issuer is also production-disabled and its denied use is audited. See [administrator support model](../architecture/ADMIN_SUPPORT_MODEL.md).

Every routed response exposes `X-Request-ID`. A caller UUIDv4 is preserved and normalized; missing or invalid values are replaced. Redis applies an IP ingress window before authentication and then a standard or sensitive route window after authentication. Rate responses expose `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and, on `429`, `Retry-After`. If Redis is unavailable, business routes return a request-correlated `503`; `/health/live` remains available while `/health` reports dependency failure.

`/internal/metrics` and `/internal/data-operations` require `x-operations-token` and are not administrator APIs. Metrics return no-store Prometheus text; data operations return aggregate state/age or a bounded drain result only. Direct users, job payloads, object keys, receipt secrets, IPs, request IDs, query values, tokens and health payloads are excluded. Production requires private scraping/control paths plus Redis TLS/ACL configuration and exact reverse-proxy hop trust.

Measurement creation also requires `x-idempotency-key`. Replacement sends `expectedRevision` in its JSON body; deletion sends the same concurrency value as `x-expected-revision`. A `409` means the client must reload instead of silently overwriting a newer state.

Workout creation uses the same `x-idempotency-key` convention, replacement carries `expectedRevision`, and deletion uses `x-expected-revision`. Workout summaries are server-derived from completed sets; load is returned in the submitted display unit plus canonical kilograms. Repeat-last is a client draft operation and always creates a new workout rather than mutating the source record.

Meal creation follows the same lifecycle headers. Each item contains an immutable food composition snapshot plus display serving and canonical grams; the server returns scaled item and meal nutrient totals. Favorite food upsert/delete changes only the owner's shortcut snapshot and never rewrites meal history. The current starter catalog is development/demo data, not a public nutrition source.

Weekly-plan generation requires `x-idempotency-key` and a Monday `weekStart`. An unchanged profile/week returns the current aggregate; a changed onboarding revision regenerates that aggregate as a new draft revision. Decisions carry `expectedRevision`; `modify` may submit only contract-listed substitutions, while `accept`, `modify` and `skip` append immutable snapshots. Generation and actionable decisions re-check current professional-clearance eligibility. The deterministic plan contains general training and qualitative meal/hydration focuses, not medical or calorie prescriptions.

AI explanation generation also requires `x-idempotency-key`, the exact `expectedPlanRevision`, and affirmative purpose/version consent. It re-checks ownership, current onboarding and risk eligibility, then sends only a minimized structured plan summary to the internal worker. The response always identifies `model`, `fixture`, or `fallback` source plus prompt/validator/model provenance; it never mutates the weekly plan. Local Compose defaults to `AI_PROVIDER=fixture`. Enabling `openai` additionally requires `OPENAI_API_KEY` and release approval for provider privacy, region, cost, latency and quality gates.

Food-photo reservation requires `x-idempotency-key` and current affirmative purpose/version consent. The signed upload accepts one bounded JPEG/PNG/still WebP multipart `file`; the API re-encodes it before private S3-compatible storage or worker access. Candidates expose ranges and provenance, never create a meal, and confirmation accepts only displayed catalog keys/grams before transactionally enqueueing media deletion and returning unsaved draft inputs. Logical deletion and `mediaDeletionStatus` are separate. The signed preview is short-lived and is not a public asset URL.

The privacy inventory reports stable user-facing categories and current consent state. Its versioned JSON export runs from a repeatable-read snapshot, includes revision history and retained sanitized photo bytes, and responds as a no-store attachment; session tokens, hashes, idempotency keys and private storage keys are excluded. Only AI-plan and food-photo purposes can be withdrawn independently.

Account erasure requires the exact shared-contract phrase, an export choice and permanent acknowledgement. The client first creates a 15-minute single-use intent and persists its 256-bit secret; the server stores only SHA-256. Deletion atomically consumes the UUID/secret pair, closes access and returns a `durable-erasure-v2` receipt. If that response is lost, the same bearer secret recovers minimal status without authentication or a receipt UUID. A PostgreSQL worker then publishes the HMAC restore ledger, deletes exact/owner-prefix media and cascades the user graph with leased retry/dead-letter evidence. Both public status routes are rate-limited/no-store and separate primary, media, provider and backup dispositions. `providerStatus=policy_bound` is not a remote-delete claim; `backupStatus=ledger_published` is not backup expiry. Production restore must replay the independently retained ledger before serving traffic.
