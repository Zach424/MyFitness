import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import {
  createHealthRecordBaseSchema,
  createHealthRecordSchema,
  demoUserIdSchema,
  healthRecordListSchema,
  healthRecordSchema,
  idempotencyKeySchema,
  type CreateHealthRecord,
} from '@myfitness/contracts'
import * as z from 'zod'

import { HealthRecordsService } from './health-records.service'

const openApiSchema = (schema: z.ZodType): SchemaObject => {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { target: 'openapi-3.0' })
  return jsonSchema as SchemaObject
}

const parseHeader = <T>(schema: z.ZodType<T>, value: string | undefined, name: string) => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new BadRequestException(`${name} header is invalid or missing`)
  return parsed.data
}

const parseBody = (body: unknown): CreateHealthRecord => {
  const parsed = createHealthRecordSchema.safeParse(body)
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'health record is invalid',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return parsed.data
}

@ApiTags('health records')
@ApiHeader({
  name: 'x-demo-user-id',
  required: true,
  description: 'Temporary local identity boundary; replaced by authenticated user context later.',
  schema: { type: 'string', format: 'uuid' },
})
@Controller('health-records')
export class HealthRecordsController {
  constructor(private readonly records: HealthRecordsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an idempotent body or recovery measurement' })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: true,
    schema: { type: 'string', minLength: 8 },
  })
  @ApiBody({ schema: openApiSchema(createHealthRecordBaseSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(healthRecordSchema) })
  @ApiBadRequestResponse({
    description: 'Contract, provenance, timezone, unit or range is invalid.',
  })
  @ApiConflictResponse({ description: 'Idempotency key was reused with different content.' })
  async create(
    @Headers('x-demo-user-id') rawUserId: string | undefined,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const userId = parseHeader(demoUserIdSchema, rawUserId, 'x-demo-user-id')
    const idempotencyKey = parseHeader(idempotencyKeySchema, rawIdempotencyKey, 'x-idempotency-key')
    const record = await this.records.create(userId, idempotencyKey, parseBody(body))
    return healthRecordSchema.parse(record)
  }

  @Get()
  @ApiOperation({ summary: 'List the latest 100 measurements for the demo user' })
  @ApiOkResponse({ schema: openApiSchema(healthRecordListSchema) })
  async list(@Headers('x-demo-user-id') rawUserId: string | undefined) {
    const userId = parseHeader(demoUserIdSchema, rawUserId, 'x-demo-user-id')
    return healthRecordListSchema.parse(await this.records.list(userId))
  }
}
