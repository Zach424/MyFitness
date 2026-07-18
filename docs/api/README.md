# API contract

The generated OpenAPI 3 document is committed as `openapi.json` so clients, reviewers, and CI can inspect contract drift without starting the service.

Regenerate it after API route or schema changes:

```bash
pnpm --filter @myfitness/api openapi:generate
```

Local routes after `pnpm db:up`, `pnpm db:migrate`, and `pnpm dev:api`:

- API readiness: `GET http://127.0.0.1:3100/v1/health`
- Swagger UI: `http://127.0.0.1:3100/docs`
- OpenAPI JSON: `http://127.0.0.1:3100/docs/openapi.json`

`x-demo-user-id` is an explicit temporary development boundary, not production authentication. It will be replaced by verified user context during the onboarding/authentication iteration.
