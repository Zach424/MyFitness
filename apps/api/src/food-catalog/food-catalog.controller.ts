import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Put,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import {
  createFoodCatalogEntrySchema,
  customFoodCatalogEntrySchema,
  expectedRevisionHeaderSchema,
  foodCatalogEntryHistorySchema,
  foodCatalogEntryHistoryQuerySchema,
  foodCatalogEntryIdSchema,
  foodCatalogEntryInputBaseSchema,
  foodCatalogListSchema,
  idempotencyKeySchema,
  updateFoodCatalogEntryBaseSchema,
  updateFoodCatalogEntrySchema,
  type CreateFoodCatalogEntry,
  type UpdateFoodCatalogEntry,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { FoodCatalogService } from './food-catalog.service'

const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new BadRequestException({
      message,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}

@ApiTags('food-catalog')
@Auth()
@Controller('food-catalog')
export class FoodCatalogController {
  constructor(private readonly catalog: FoodCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List versioned starter and active user-owned foods' })
  @ApiOkResponse({ schema: openApiSchema(foodCatalogListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return foodCatalogListSchema.parse(await this.catalog.list(principal.userId))
  }

  @Post()
  @ApiOperation({ summary: 'Create an idempotent user-owned food definition' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(foodCatalogEntryInputBaseSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(customFoodCatalogEntrySchema) })
  @ApiBadRequestResponse({ description: 'Food definition, basis or nutrition values are invalid.' })
  @ApiConflictResponse({ description: 'Name or idempotency key is already in use.' })
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: CreateFoodCatalogEntry = parse(
      createFoodCatalogEntrySchema,
      body,
      'food entry is invalid',
    )
    return customFoodCatalogEntrySchema.parse(
      await this.catalog.create(principal.userId, key, input),
    )
  }

  @Put(':entryId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Correct a user-owned food using optimistic revision control' })
  @ApiParam({ name: 'entryId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(updateFoodCatalogEntryBaseSchema) })
  @ApiOkResponse({ schema: openApiSchema(customFoodCatalogEntrySchema) })
  @ApiConflictResponse({ description: 'Expected revision or active name conflicts.' })
  @ApiNotFoundResponse({ description: 'Food entry does not exist for this user.' })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('entryId') rawId: string,
    @Body() body: unknown,
  ) {
    const id = parse(foodCatalogEntryIdSchema, rawId, 'entryId must be a UUID')
    const input: UpdateFoodCatalogEntry = parse(
      updateFoodCatalogEntrySchema,
      body,
      'food entry update is invalid',
    )
    return customFoodCatalogEntrySchema.parse(
      await this.catalog.update(principal.userId, id, input),
    )
  }

  @Delete(':entryId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archive a user-owned food without rewriting meal snapshots' })
  @ApiParam({ name: 'entryId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'x-expected-revision', required: true })
  @ApiOkResponse({ schema: openApiSchema(customFoodCatalogEntrySchema) })
  @ApiConflictResponse({ description: 'Expected revision does not match.' })
  @ApiNotFoundResponse({ description: 'Food entry does not exist for this user.' })
  async archive(
    @CurrentUser() principal: AuthPrincipal,
    @Param('entryId') rawId: string,
    @Headers('x-expected-revision') rawRevision: string | undefined,
  ) {
    const id = parse(foodCatalogEntryIdSchema, rawId, 'entryId must be a UUID')
    const revision = parse(
      expectedRevisionHeaderSchema,
      rawRevision,
      'x-expected-revision is invalid or missing',
    )
    return customFoodCatalogEntrySchema.parse(
      await this.catalog.archive(principal.userId, id, revision),
    )
  }

  @Get(':entryId/history')
  @ApiOperation({ summary: 'Read immutable user-owned food definition revisions' })
  @ApiParam({ name: 'entryId', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string', minLength: 24, maxLength: 256 },
  })
  @ApiOkResponse({ schema: openApiSchema(foodCatalogEntryHistorySchema) })
  @ApiBadRequestResponse({ description: 'Entry identifier, history limit or cursor is invalid.' })
  @ApiNotFoundResponse({ description: 'Food entry does not exist for this user.' })
  async history(
    @CurrentUser() principal: AuthPrincipal,
    @Param('entryId') rawId: string,
    @Query() query: unknown,
  ) {
    const id = parse(foodCatalogEntryIdSchema, rawId, 'entryId must be a UUID')
    const parsed = parse(
      foodCatalogEntryHistoryQuerySchema,
      query,
      'food definition history query is invalid',
    )
    return foodCatalogEntryHistorySchema.parse(
      await this.catalog.history(principal.userId, id, parsed),
    )
  }
}
