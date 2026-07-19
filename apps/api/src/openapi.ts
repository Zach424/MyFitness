import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export const buildOpenApiDocument = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('MyFitness API')
    .setDescription(
      'Privacy-first record API. AI-derived values remain candidates until explicit confirmation.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(undefined, 'bearer')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque administrator session',
        description: 'Independent administrator session; never interchangeable with a user token.',
      },
      'adminBearer',
    )
    .build()

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) => `${controller}_${method}`,
  })
}

export const mountOpenApi = (app: INestApplication) => {
  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  })
}
