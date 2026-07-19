import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'

import { createApplication } from './bootstrap'
import { buildOpenApiDocument } from './openapi'

describe('OpenAPI document', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApplication(false)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('publishes health and health-record operations', () => {
    const document = buildOpenApiDocument(app)

    expect(document.paths['/v1/health']?.get).toBeDefined()
    expect(document.paths['/v1/health/live']?.get).toBeDefined()
    expect(document.paths['/v1/internal/metrics']?.get).toBeDefined()
    expect(document.paths['/v1/admin/auth/dev/session']?.post).toBeDefined()
    expect(document.paths['/v1/admin/auth/oidc/exchange']?.post).toBeDefined()
    expect(document.paths['/v1/admin/auth/me']?.get).toBeDefined()
    expect(document.paths['/v1/admin/auth/session']?.delete).toBeDefined()
    expect(document.paths['/v1/admin/support/users/lookup']?.post).toBeDefined()
    expect(document.paths['/v1/admin/audit']?.get).toBeDefined()
    expect(document.paths['/v1/health-records']?.post).toBeDefined()
    expect(document.paths['/v1/health-records']?.get).toBeDefined()
    expect(document.paths['/v1/health-records/{recordId}']?.put).toBeDefined()
    expect(document.paths['/v1/health-records/{recordId}']?.delete).toBeDefined()
    expect(document.paths['/v1/health-records/{recordId}/history']?.get).toBeDefined()
    expect(document.paths['/v1/workouts']?.post).toBeDefined()
    expect(document.paths['/v1/workouts']?.get).toBeDefined()
    expect(document.paths['/v1/workouts/{workoutId}']?.put).toBeDefined()
    expect(document.paths['/v1/workouts/{workoutId}']?.delete).toBeDefined()
    expect(document.paths['/v1/workouts/{workoutId}/history']?.get).toBeDefined()
    expect(document.paths['/v1/nutrition/meals']?.post).toBeDefined()
    expect(document.paths['/v1/nutrition/meals']?.get).toBeDefined()
    expect(document.paths['/v1/nutrition/meals/{mealId}']?.put).toBeDefined()
    expect(document.paths['/v1/nutrition/meals/{mealId}']?.delete).toBeDefined()
    expect(document.paths['/v1/nutrition/meals/{mealId}/history']?.get).toBeDefined()
    expect(document.paths['/v1/nutrition/favorites']?.get).toBeDefined()
    expect(document.paths['/v1/nutrition/favorites/{foodKey}']?.put).toBeDefined()
    expect(document.paths['/v1/nutrition/favorites/{foodKey}']?.delete).toBeDefined()
    expect(document.paths['/v1/insights/dashboard']?.get).toBeDefined()
    expect(document.paths['/v1/plans/weekly']?.post).toBeDefined()
    expect(document.paths['/v1/plans/weekly']?.get).toBeDefined()
    expect(document.paths['/v1/plans/weekly/{planId}/decision']?.put).toBeDefined()
    expect(document.paths['/v1/plans/weekly/{planId}/history']?.get).toBeDefined()
    expect(document.paths['/v1/plans/weekly/{planId}/explanation']?.post).toBeDefined()
    expect(document.paths['/v1/plans/weekly/{planId}/explanations']?.get).toBeDefined()
    expect(document.paths['/v1/auth/dev/session']?.post).toBeDefined()
    expect(document.paths['/v1/me/onboarding']?.put).toBeDefined()
    expect(document.paths['/v1/me/onboarding']?.get).toBeDefined()
    expect(document.paths['/v1/me/privacy']?.get).toBeDefined()
    expect(document.paths['/v1/me/privacy/export']?.get).toBeDefined()
    expect(document.paths['/v1/me/privacy/consents/{purpose}/revoke']?.post).toBeDefined()
    expect(document.paths['/v1/me/privacy/account']?.delete).toBeDefined()
    expect(document.components?.securitySchemes?.bearer).toBeDefined()
    expect(document.components?.securitySchemes?.adminBearer).toBeDefined()
  })

  it('allows lifecycle headers through the H5 CORS preflight', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/health-records/00000000-0000-4000-8000-000000000000')
      .set('Origin', 'http://127.0.0.1:4173')
      .set('Access-Control-Request-Method', 'DELETE')
      .set('Access-Control-Request-Headers', 'authorization,x-expected-revision,x-request-id')
      .expect(204)

    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4173')
    expect(response.headers['access-control-allow-headers']).toContain('x-expected-revision')
    expect(response.headers['access-control-allow-headers']).toContain('x-request-id')
    expect(response.headers['access-control-expose-headers']).toContain('x-request-id')
  })
})
