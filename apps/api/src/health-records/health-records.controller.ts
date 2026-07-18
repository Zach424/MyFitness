import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import {
  createHealthRecordBaseSchema,
  createHealthRecordSchema,
  expectedRevisionHeaderSchema,
  healthRecordHistorySchema,
  healthRecordListSchema,
  healthRecordSchema,
  idempotencyKeySchema,
  recordIdSchema,
  updateHealthRecordBaseSchema,
  updateHealthRecordSchema,
  type CreateHealthRecord,
  type UpdateHealthRecord,
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

const parseBody = <T>(schema: z.ZodType<T>, body: unknown, message: string): T => {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new BadRequestException({
      message,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return parsed.data
}

const parseRecordId = (value: string) => {
  const parsed = recordIdSchema.safeParse(value)
  if (!parsed.success) throw new BadRequestException('recordId must be a UUID')
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
    const input: CreateHealthRecord = parseBody(
      createHealthRecordSchema,
      body,
      'health record is invalid',
    )
    const record = await this.records.create(principal.userId, idempotencyKey, input)
    return healthRecordSchema.parse(record)
  }

  @Get()
  @ApiOperation({ summary: 'List the latest 100 measurements for the authenticated user' })
  @ApiOkResponse({ schema: openApiSchema(healthRecordListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return healthRecordListSchema.parse(await this.records.list(principal.userId))
  }

  @Put(':recordId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Replace a measurement using optimistic revision control' })
  @ApiParam({ name: 'recordId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(updateHealthRecordBaseSchema) })
  @ApiOkResponse({ schema: openApiSchema(healthRecordSchema) })
  @ApiBadRequestResponse({ description: 'Record identifier or measurement input is invalid.' })
  @ApiConflictResponse({ description: 'expectedRevision does not match the stored record.' })
  @ApiNotFoundResponse({ description: 'Record does not exist for the authenticated user.' })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('recordId') rawRecordId: string,
    @Body() body: unknown,
  ) {
    const input: UpdateHealthRecord = parseBody(
      updateHealthRecordSchema,
      body,
      'health record update is invalid',
    )
    return healthRecordSchema.parse(
      await this.records.update(principal.userId, parseRecordId(rawRecordId), input),
    )
  }

  @Delete(':recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a measurement using optimistic revision control' })
  @ApiParam({ name: 'recordId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({
    name: 'x-expected-revision',
    required: true,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiNoContentResponse({ description: 'Measurement was deleted and retained in its audit trail.' })
  @ApiBadRequestResponse({ description: 'Record identifier or expected revision is invalid.' })
  @ApiConflictResponse({ description: 'Expected revision does not match the stored record.' })
  @ApiNotFoundResponse({ description: 'Record does not exist for the authenticated user.' })
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('recordId') rawRecordId: string,
    @Headers('x-expected-revision') rawExpectedRevision: string | undefined,
  ) {
    const expectedRevision = parseHeader(
      expectedRevisionHeaderSchema,
      rawExpectedRevision,
      'x-expected-revision',
    )
    await this.records.remove(principal.userId, parseRecordId(rawRecordId), expectedRevision)
  }

  @Get(':recordId/history')
  @ApiOperation({ summary: 'Get the immutable revision history for a measurement' })
  @ApiParam({ name: 'recordId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: openApiSchema(healthRecordHistorySchema) })
  @ApiBadRequestResponse({ description: 'Record identifier is invalid.' })
  @ApiNotFoundResponse({ description: 'Record does not exist for the authenticated user.' })
  async history(@CurrentUser() principal: AuthPrincipal, @Param('recordId') rawRecordId: string) {
    return healthRecordHistorySchema.parse(
      await this.records.history(principal.userId, parseRecordId(rawRecordId)),
    )
  }
}
