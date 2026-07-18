# API contract

The generated OpenAPI 3 document is committed as `openapi.json` so clients, reviewers, and CI can inspect contract drift without starting the service.

Regenerate it after API route or schema changes:

```bash
pnpm --filter @myfitness/api openapi:generate
```

Local routes after `pnpm db:up`, `pnpm db:migrate`, and `pnpm dev:api`:

- API readiness: `GET http://127.0.0.1:3100/v1/health`
- Local-only session: `POST http://127.0.0.1:3100/v1/auth/dev/session`
- Current onboarding: `GET/PUT http://127.0.0.1:3100/v1/me/onboarding`
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
- Today and trends: `GET http://127.0.0.1:3100/v1/insights/dashboard?timezone=Asia%2FShanghai`
- Weekly-plan generation/list: `POST/GET http://127.0.0.1:3100/v1/plans/weekly`
- Weekly-plan decision: `PUT http://127.0.0.1:3100/v1/plans/weekly/:planId/decision`
- Weekly-plan history: `GET http://127.0.0.1:3100/v1/plans/weekly/:planId/history`
- AI plan explanation: `POST http://127.0.0.1:3100/v1/plans/weekly/:planId/explanation`
- AI explanation history: `GET http://127.0.0.1:3100/v1/plans/weekly/:planId/explanations`
- Swagger UI: `http://127.0.0.1:3100/docs`
- OpenAPI JSON: `http://127.0.0.1:3100/docs/openapi.json`

Protected routes require `Authorization: Bearer <opaque-token>`. The local session issuer accepts a stable development subject, returns a seven-day token, stores only its SHA-256 hash, and is disabled when `NODE_ENV=production`. It exercises the same server-side principal and user-ownership boundary as a future verified WeChat/phone adapter, but is not production authentication.

Measurement creation also requires `x-idempotency-key`. Replacement sends `expectedRevision` in its JSON body; deletion sends the same concurrency value as `x-expected-revision`. A `409` means the client must reload instead of silently overwriting a newer state.

Workout creation uses the same `x-idempotency-key` convention, replacement carries `expectedRevision`, and deletion uses `x-expected-revision`. Workout summaries are server-derived from completed sets; load is returned in the submitted display unit plus canonical kilograms. Repeat-last is a client draft operation and always creates a new workout rather than mutating the source record.

Meal creation follows the same lifecycle headers. Each item contains an immutable food composition snapshot plus display serving and canonical grams; the server returns scaled item and meal nutrient totals. Favorite food upsert/delete changes only the owner's shortcut snapshot and never rewrites meal history. The current starter catalog is development/demo data, not a public nutrition source.

Weekly-plan generation requires `x-idempotency-key` and a Monday `weekStart`. An unchanged profile/week returns the current aggregate; a changed onboarding revision regenerates that aggregate as a new draft revision. Decisions carry `expectedRevision`; `modify` may submit only contract-listed substitutions, while `accept`, `modify` and `skip` append immutable snapshots. Generation and actionable decisions re-check current professional-clearance eligibility. The deterministic plan contains general training and qualitative meal/hydration focuses, not medical or calorie prescriptions.

AI explanation generation also requires `x-idempotency-key`, the exact `expectedPlanRevision`, and affirmative purpose/version consent. It re-checks ownership, current onboarding and risk eligibility, then sends only a minimized structured plan summary to the internal worker. The response always identifies `model`, `fixture`, or `fallback` source plus prompt/validator/model provenance; it never mutates the weekly plan. Local Compose defaults to `AI_PROVIDER=fixture`. Enabling `openai` additionally requires `OPENAI_API_KEY` and release approval for provider privacy, region, cost, latency and quality gates.
