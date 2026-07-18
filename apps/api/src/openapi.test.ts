import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'

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
    expect(document.paths['/v1/health-records']?.post).toBeDefined()
    expect(document.paths['/v1/health-records']?.get).toBeDefined()
  })
})
