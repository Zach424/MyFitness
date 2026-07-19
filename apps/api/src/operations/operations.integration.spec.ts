import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { createClient } from 'redis'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApplication } from '../bootstrap'
import { DatabaseService } from '../database/database.service'
import type { RateLimitPolicy } from './operations.types'
import { rateLimitPolicies } from './rate-limit.policies'
import { RateLimitService } from './rate-limit.service'
import { RedisService } from './redis.service'

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:63799'
const operationsToken = 'integration-operations-token-2026-safe'
const keyPrefix = `myfitness:rate:test:${randomUUID()}`
const subjects: string[] = []

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('operations perimeter integration', () => {
  let app: INestApplication
  let database: DatabaseService
  const cleanupClient = createClient({ url: redisUrl })
  const previousEnvironment = {
    operationsToken: process.env.OPERATIONS_TOKEN,
    keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX,
    trustProxyHops: process.env.TRUST_PROXY_HOPS,
  }

  beforeAll(async () => {
    process.env.OPERATIONS_TOKEN = operationsToken
    process.env.RATE_LIMIT_KEY_PREFIX = keyPrefix
    process.env.TRUST_PROXY_HOPS = '1'
    await cleanupClient.connect()
    app = await createApplication(false)
    await app.init()
    database = app.get(DatabaseService)
  })

  afterAll(async () => {
    if (subjects.length) {
      await database.query(
        `DELETE FROM users WHERE id IN (
           SELECT user_id FROM auth_identities
           WHERE provider = 'dev' AND provider_subject = ANY($1::text[])
         )`,
        [subjects],
      )
    }
    const keys = await cleanupClient.keys(`${keyPrefix}:*`)
    if (keys.length) await cleanupClient.del(keys)
    cleanupClient.destroy()
    await app.close()
    restoreEnvironment('OPERATIONS_TOKEN', previousEnvironment.operationsToken)
    restoreEnvironment('RATE_LIMIT_KEY_PREFIX', previousEnvironment.keyPrefix)
    restoreEnvironment('TRUST_PROXY_HOPS', previousEnvironment.trustProxyHops)
  })

  it('echoes only valid request IDs and reports PostgreSQL plus Redis readiness', async () => {
    const requestId = randomUUID()
    const ready = await request(app.getHttpServer())
      .get('/v1/health')
      .set('x-request-id', requestId.toUpperCase())
      .expect(200)

    expect(ready.headers['x-request-id']).toBe(requestId)
    expect(ready.body).toMatchObject({ status: 'ok', database: 'up', redis: 'up' })
    expect(ready.headers['ratelimit-limit']).toBeUndefined()

    const alive = await request(app.getHttpServer())
      .get('/v1/health/live')
      .set('x-request-id', 'not-a-uuid-secret')
      .expect(200)
    expect(alive.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('shares one atomic limit across independent Redis clients', async () => {
    const redisA = new RedisService()
    const redisB = new RedisService()
    const limiterA = new RateLimitService(redisA)
    const limiterB = new RateLimitService(redisB)
    const policy: RateLimitPolicy = {
      name: `shared_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      limit: 5,
      windowSeconds: 60,
    }

    const decisions = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 ? limiterA : limiterB).consume(policy, 'user:shared-integration-actor'),
      ),
    )
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5)
    expect(decisions.map((decision) => decision.count).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    redisA.onModuleDestroy()
    redisB.onModuleDestroy()
  })

  it('applies ingress protection and lifecycle metrics before Bearer authentication', async () => {
    const ip = '198.51.100.28'
    await request(app.getHttpServer())
      .get('/v1/health-records')
      .set('x-forwarded-for', ip)
      .set('authorization', 'Bearer invalid-token')
      .expect(401)

    const nextIngress = await app
      .get(RateLimitService)
      .consume(rateLimitPolicies.ingress, `ip:${ip}`)
    expect(nextIngress.count).toBe(2)
  })

  it('returns standard limit headers and a correlated 429 at the route boundary', async () => {
    const ip = '203.0.113.17'
    const policy = rateLimitPolicies.authSession
    const limiter = app.get(RateLimitService)
    for (let index = 0; index < 59; index += 1) {
      await limiter.consume(policy, `ip:${ip}`)
    }
    const subject = `ops-limit-${randomUUID()}`
    subjects.push(subject)
    const accepted = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .set('x-forwarded-for', ip)
      .send({ subject })
      .expect(200)
    expect(accepted.headers['ratelimit-limit']).toBe('60')
    expect(accepted.headers['ratelimit-remaining']).toBe('0')
    expect(accepted.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

    const rejected = await request(app.getHttpServer())
      .post('/v1/auth/dev/session')
      .set('x-forwarded-for', ip)
      .send({ subject: `ops-rejected-${randomUUID()}` })
      .expect(429)
    expect(rejected.headers['retry-after']).toMatch(/^\d+$/)
    expect(rejected.body).toMatchObject({
      statusCode: 429,
      code: 'rate_limit_exceeded',
      requestId: rejected.headers['x-request-id'],
    })
  })

  it('protects bounded Prometheus metrics with a separate operations token', async () => {
    await request(app.getHttpServer()).get('/v1/internal/metrics').expect(401)
    await request(app.getHttpServer())
      .get('/v1/internal/metrics')
      .set('x-operations-token', 'wrong-token-with-enough-length-0000')
      .expect(401)

    const metrics = await request(app.getHttpServer())
      .get('/v1/internal/metrics')
      .set('x-operations-token', operationsToken)
      .expect(200)
    expect(metrics.headers['cache-control']).toBe('no-store')
    expect(metrics.text).toContain('myfitness_http_requests_total')
    expect(metrics.text).toContain('route="/v1/auth/dev/session"')
    expect(metrics.text).toContain('route="/v1/health-records",status="401"} 1')
    expect(metrics.text).toContain('myfitness_rate_limit_rejections_total{policy="auth_session"} 1')
    expect(metrics.text).not.toContain('203.0.113.17')
    expect(metrics.text).not.toContain(subjects[0])
  })

  it('fails business traffic closed while keeping liveness available when Redis is down', async () => {
    const previousRedisUrl = process.env.REDIS_URL
    process.env.REDIS_URL = 'redis://127.0.0.1:63998'
    const failureApp = await createApplication(false)
    await failureApp.init()
    try {
      const failed = await request(failureApp.getHttpServer())
        .post('/v1/auth/dev/session')
        .send({ subject: `ops-backend-failure-${randomUUID()}` })
        .expect(503)
      expect(failed.body).toMatchObject({
        code: 'rate_limit_backend_unavailable',
        requestId: failed.headers['x-request-id'],
      })
      await request(failureApp.getHttpServer()).get('/v1/health/live').expect(200)
      await request(failureApp.getHttpServer()).get('/v1/health').expect(503)
    } finally {
      await failureApp.close()
      restoreEnvironment('REDIS_URL', previousRedisUrl)
    }
  })
})
