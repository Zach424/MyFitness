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
- Swagger UI: `http://127.0.0.1:3100/docs`
- OpenAPI JSON: `http://127.0.0.1:3100/docs/openapi.json`

Protected routes require `Authorization: Bearer <opaque-token>`. The local session issuer accepts a stable development subject, returns a seven-day token, stores only its SHA-256 hash, and is disabled when `NODE_ENV=production`. It exercises the same server-side principal and user-ownership boundary as a future verified WeChat/phone adapter, but is not production authentication.
