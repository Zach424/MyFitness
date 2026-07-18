import { type INestApplication, type LogLevel } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { mountOpenApi } from './openapi'

const configureApplication = (app: INestApplication) => {
  app.setGlobalPrefix('v1')
  app.enableShutdownHooks()
  mountOpenApi(app)
  return app
}

export const createApplication = async (logger: false | LogLevel[] = ['error', 'warn', 'log']) => {
  const app = await NestFactory.create(AppModule, { logger })
  return configureApplication(app)
}
