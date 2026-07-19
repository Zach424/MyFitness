import { type INestApplication, type LogLevel } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import type { ApplicationStartupMode } from './application-lifecycle'
import { getRuntimeConfig } from './config'
import { mountOpenApi } from './openapi'
import { OperationalMetricsService } from './operations/operational-metrics.service'
import { requestIdMiddleware } from './operations/request-id.middleware'
import { createRequestLifecycleMiddleware } from './operations/request-lifecycle.middleware'

const configureApplication = (app: INestApplication) => {
  const config = getRuntimeConfig()
  const adapter = app.getHttpAdapter().getInstance() as {
    set(name: string, value: boolean | number): void
  }
  adapter.set('trust proxy', config.trustProxyHops === 0 ? false : config.trustProxyHops)
  app.use(requestIdMiddleware)
  app.use(createRequestLifecycleMiddleware(app.get(OperationalMetricsService)))
  app.setGlobalPrefix('v1')
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [
      'http://127.0.0.1:4173',
      'http://localhost:10086',
    ],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'x-idempotency-key',
      'x-expected-revision',
      'x-erasure-intent-token',
      'x-erasure-receipt-token',
      'x-request-id',
    ],
    exposedHeaders: [
      'x-request-id',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
      'retry-after',
    ],
    credentials: true,
  })
  app.enableShutdownHooks()
  mountOpenApi(app)
  return app
}

export const createApplication = async (
  logger: false | LogLevel[] = ['error', 'warn', 'log'],
  startupMode: ApplicationStartupMode = 'runtime',
) => {
  const app = await NestFactory.create(AppModule.register(startupMode), { logger })
  return configureApplication(app)
}
