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
  createMealSchema,
  expectedRevisionHeaderSchema,
  favoriteFoodInputSchema,
  favoriteFoodListSchema,
  favoriteFoodSchema,
  foodKeySchema,
  idempotencyKeySchema,
  mealBaseSchema,
  mealHistorySchema,
  mealIdSchema,
  mealListSchema,
  mealSchema,
  updateMealBaseSchema,
  updateMealSchema,
  type CreateMeal,
  type FavoriteFoodInput,
  type UpdateMeal,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { NutritionService } from './nutrition.service'

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

@ApiTags('nutrition')
@Auth()
@Controller('nutrition')
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Post('meals')
  @ApiOperation({ summary: 'Create an idempotent meal with food snapshots' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(mealBaseSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(mealSchema) })
  @ApiBadRequestResponse({ description: 'Meal, portion or nutrient snapshot is invalid.' })
  @ApiConflictResponse({ description: 'Idempotency key was reused with different content.' })
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: CreateMeal = parse(createMealSchema, body, 'meal is invalid')
    return mealSchema.parse(await this.nutrition.create(principal.userId, key, input))
  }

  @Get('meals')
  @ApiOperation({ summary: 'List the latest 50 meals' })
  @ApiOkResponse({ schema: openApiSchema(mealListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return mealListSchema.parse(await this.nutrition.list(principal.userId))
  }

  @Put('meals/:mealId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Replace a meal using optimistic revision control' })
  @ApiParam({ name: 'mealId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(updateMealBaseSchema) })
  @ApiOkResponse({ schema: openApiSchema(mealSchema) })
  @ApiConflictResponse({ description: 'expectedRevision does not match.' })
  @ApiNotFoundResponse({ description: 'Meal does not exist for this user.' })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('mealId') rawId: string,
    @Body() body: unknown,
  ) {
    const id = parse(mealIdSchema, rawId, 'mealId must be a UUID')
    const input: UpdateMeal = parse(updateMealSchema, body, 'meal update is invalid')
    return mealSchema.parse(await this.nutrition.update(principal.userId, id, input))
  }

  @Delete('meals/:mealId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a meal using optimistic revision control' })
  @ApiParam({ name: 'mealId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'x-expected-revision', required: true })
  @ApiNoContentResponse({ description: 'Meal was removed from routine lists.' })
  @ApiConflictResponse({ description: 'Expected revision does not match.' })
  @ApiNotFoundResponse({ description: 'Meal does not exist for this user.' })
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('mealId') rawId: string,
    @Headers('x-expected-revision') rawRevision: string | undefined,
  ) {
    const id = parse(mealIdSchema, rawId, 'mealId must be a UUID')
    const revision = parse(
      expectedRevisionHeaderSchema,
      rawRevision,
      'x-expected-revision is invalid or missing',
    )
    await this.nutrition.remove(principal.userId, id, revision)
  }

  @Get('meals/:mealId/history')
  @ApiOperation({ summary: 'Get immutable meal revisions' })
  @ApiParam({ name: 'mealId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: openApiSchema(mealHistorySchema) })
  @ApiNotFoundResponse({ description: 'Meal does not exist for this user.' })
  async history(@CurrentUser() principal: AuthPrincipal, @Param('mealId') rawId: string) {
    const id = parse(mealIdSchema, rawId, 'mealId must be a UUID')
    return mealHistorySchema.parse(await this.nutrition.history(principal.userId, id))
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List favorite food snapshots' })
  @ApiOkResponse({ schema: openApiSchema(favoriteFoodListSchema) })
  async favorites(@CurrentUser() principal: AuthPrincipal) {
    return favoriteFoodListSchema.parse(await this.nutrition.listFavorites(principal.userId))
  }

  @Put('favorites/:foodKey')
  @ApiOperation({ summary: 'Create or refresh a favorite food snapshot' })
  @ApiParam({ name: 'foodKey', schema: { type: 'string' } })
  @ApiBody({ schema: openApiSchema(favoriteFoodInputSchema) })
  @ApiOkResponse({ schema: openApiSchema(favoriteFoodSchema) })
  async saveFavorite(
    @CurrentUser() principal: AuthPrincipal,
    @Param('foodKey') rawKey: string,
    @Body() body: unknown,
  ) {
    const foodKey = parse(foodKeySchema, rawKey, 'foodKey is invalid')
    const input: FavoriteFoodInput = parse(
      favoriteFoodInputSchema,
      body,
      'favorite food is invalid',
    )
    if (foodKey !== input.food.foodKey) {
      throw new BadRequestException('foodKey must match the favorite payload')
    }
    return favoriteFoodSchema.parse(await this.nutrition.saveFavorite(principal.userId, input))
  }

  @Delete('favorites/:foodKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a favorite food snapshot' })
  @ApiParam({ name: 'foodKey', schema: { type: 'string' } })
  @ApiNoContentResponse({ description: 'Favorite is absent after the request.' })
  async removeFavorite(@CurrentUser() principal: AuthPrincipal, @Param('foodKey') rawKey: string) {
    const foodKey = parse(foodKeySchema, rawKey, 'foodKey is invalid')
    await this.nutrition.removeFavorite(principal.userId, foodKey)
  }
}
