# API operations runbook

Status: local implementation evidence; production ownership and alert delivery are not yet assigned

## Deployment preflight

1. Provide `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_HASH_SECRET`, `OPERATIONS_TOKEN`, AI/photo secrets and the exact `TRUST_PROXY_HOPS` through a secret manager.
2. Require TLS plus ACL credentials in the production Redis URL. Keep the rate key prefix isolated from queues or application caches.
3. Apply checksum-verified database migrations before shifting traffic.
4. Verify `/v1/health/live` returns `200`, then `/v1/health` returns PostgreSQL and Redis `up`.
5. Scrape `/v1/internal/metrics` through a private network path. Never put the operations token in H5, Mini Program code or a browser admin bundle.
6. Send a canary request with a UUIDv4 `x-request-id` and verify the same value in response headers and structured logs.

## Minimum dashboard

- Request rate split by stable route and status.
- Duration p50/p95/p99 from `myfitness_http_request_duration_seconds`.
- `myfitness_rate_limit_rejections_total` split by policy.
- Any increase in `myfitness_rate_limit_backend_failures_total`.
- PostgreSQL/Redis readiness and process/container restarts.
- Redis memory, connections, command latency and rejected writes under `noeviction`.

Suggested initial review thresholds—not production-certified SLOs:

- Page immediately when readiness is continuously down for 2 minutes or limiter-backend failures increase.
- Investigate when non-429 5xx exceeds 2% for 5 minutes.
- Investigate when p95 exceeds 1 second for 10 minutes on non-AI routes.
- Review abuse/policy fit when 429 exceeds 10% of a route for 5 minutes; do not automatically raise a quota.

## Redis incident

1. Confirm liveness remains `200` and readiness is `503`.
2. Use the request ID from a failed response to find `ingress_rate_limit_backend_failure` or `rate_limit_backend_failure` without copying request bodies into the incident channel.
3. Check managed Redis reachability, TLS/ACL validity, memory/noeviction state and recent secret/network changes.
4. Restore the shared Redis dependency or roll back the API release. Do not patch the service to fail open.
5. After recovery, verify readiness, one ordinary request, one protected metrics scrape and that the backend-failure counter stops increasing.

## Elevated 429 incident

1. Identify the named policy and stable route from metrics; do not request raw user health payloads.
2. Compare ingress rejections with authenticated route rejections to distinguish perimeter traffic from a product workflow loop.
3. Check client retry behavior against `Retry-After` and look for duplicate idempotency attempts.
4. If the policy is incorrect, change the centralized policy constant, test the exact boundary, deploy normally and record the reason. Avoid live Redis key edits as a durable fix.
5. If abuse is suspected, preserve aggregate evidence and follow the future support/security escalation process; administrator blocking is not implemented yet.

## Secret rotation

- Rotating `OPERATIONS_TOKEN` requires coordinated scraper and API restart. Confirm old-token `401` and new-token `200`.
- Rotating `RATE_LIMIT_HASH_SECRET` changes every actor fingerprint and effectively resets active windows. Perform during a controlled deployment and record the reset.
- Never log either secret or place them in committed environment files.

## Rollback verification

After an application rollback, rerun liveness/readiness, verify migration compatibility, make one correlated business request, inspect rate headers, scrape metrics and run the current privacy deletion smoke test. A rollback is incomplete if it restores HTTP traffic by bypassing Redis, weakens auth, or loses request correlation.
