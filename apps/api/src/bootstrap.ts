import { type INestApplication, type LogLevel } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { mountOpenApi } from './openapi'

const configureApplication = (app: INestApplication) => {
  app.setGlobalPrefix('v1')
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [
      'http://127.0.0.1:4173',
      'http://localhost:10086',
    ],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-idempotency-key'],
  })
  app.enableShutdownHooks()
  mountOpenApi(app)
  return app
}

export const createApplication = async (logger: false | LogLevel[] = ['error', 'warn', 'log']) => {
  const app = await NestFactory.create(AppModule, { logger })
  return configureApplication(app)
}
