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
import {
  createHealthRecordBaseSchema,
  createHealthRecordSchema,
  healthRecordListSchema,
  healthRecordSchema,
  idempotencyKeySchema,
  type CreateHealthRecord,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { HealthRecordsService } from './health-records.service'

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
@Auth()
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
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const idempotencyKey = parseHeader(idempotencyKeySchema, rawIdempotencyKey, 'x-idempotency-key')
    const record = await this.records.create(principal.userId, idempotencyKey, parseBody(body))
    return healthRecordSchema.parse(record)
  }

  @Get()
  @ApiOperation({ summary: 'List the latest 100 measurements for the authenticated user' })
  @ApiOkResponse({ schema: openApiSchema(healthRecordListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return healthRecordListSchema.parse(await this.records.list(principal.userId))
  }
}
