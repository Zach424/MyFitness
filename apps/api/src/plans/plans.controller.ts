import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import {
  createPlanWorkoutLinkSchema,
  expectedRevisionHeaderSchema,
  generateWeeklyPlanSchema,
  idempotencyKeySchema,
  planDecisionSchema,
  planExperienceReflectionSchema,
  planExperienceReflectionReadSchema,
  planOutcomeReviewSchema,
  planWorkoutLinkIdSchema,
  planWorkoutLinkClosureSchema,
  planWorkoutLinkSchema,
  weeklyPlanHistorySchema,
  weeklyPlanHistoryQuerySchema,
  weeklyPlanIdSchema,
  weeklyPlanListSchema,
  weeklyPlanRevisionSchema,
  weeklyPlanSchema,
  writePlanExperienceReflectionSchema,
  type GenerateWeeklyPlan,
  type PlanDecision,
  type CreatePlanWorkoutLink,
  type WritePlanExperienceReflection,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { PlansService } from './plans.service'

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

@ApiTags('plans')
@Auth()
@Controller('plans/weekly')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  @ApiOperation({ summary: 'Generate one deterministic weekly plan from current constraints' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(generateWeeklyPlanSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(weeklyPlanSchema) })
  @ApiBadRequestResponse({ description: 'Week start or idempotency key is invalid.' })
  @ApiConflictResponse({ description: 'Idempotency key conflicts with another request.' })
  @ApiUnprocessableEntityResponse({
    description: 'Onboarding or professional clearance blocks plan generation.',
  })
  async generate(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: GenerateWeeklyPlan = parse(
      generateWeeklyPlanSchema,
      body,
      'weekly plan request is invalid',
    )
    return weeklyPlanSchema.parse(await this.plans.generate(principal.userId, key, input))
  }

  @Get()
  @ApiOperation({ summary: 'List the latest 12 weekly plans' })
  @ApiOkResponse({ schema: openApiSchema(weeklyPlanListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return weeklyPlanListSchema.parse(await this.plans.list(principal.userId))
  }

  @Post(':planId/session-links')
  @ApiOperation({ summary: 'Explicitly link one plan session revision to one actual workout' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(createPlanWorkoutLinkSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(planWorkoutLinkSchema) })
  @ApiBadRequestResponse({ description: 'Plan session link input is invalid.' })
  @ApiConflictResponse({ description: 'Plan, workout or evidence revision is stale or linked.' })
  @ApiNotFoundResponse({ description: 'Plan or workout does not exist for this user.' })
  @ApiUnprocessableEntityResponse({ description: 'Plan is not adopted or has no such session.' })
  async linkWorkout(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawPlanId: string,
    @Body() body: unknown,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawPlanId, 'planId must be a UUID')
    const input: CreatePlanWorkoutLink = parse(
      createPlanWorkoutLinkSchema,
      body,
      'plan workout link is invalid',
    )
    return planWorkoutLinkSchema.parse(
      await this.plans.linkWorkout(principal.userId, planId, input),
    )
  }

  @Delete(':planId/session-links/:linkId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close an explicit plan-to-workout link without deleting its history' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'linkId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'x-expected-revision', required: true })
  @ApiOkResponse({ schema: openApiSchema(planWorkoutLinkClosureSchema) })
  @ApiConflictResponse({ description: 'Expected link revision does not match.' })
  @ApiNotFoundResponse({ description: 'Active link does not exist for this user and plan.' })
  async unlinkWorkout(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawPlanId: string,
    @Param('linkId') rawLinkId: string,
    @Headers('x-expected-revision') rawRevision: string | undefined,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawPlanId, 'planId must be a UUID')
    const linkId = parse(planWorkoutLinkIdSchema, rawLinkId, 'linkId must be a UUID')
    const revision = parse(
      expectedRevisionHeaderSchema,
      rawRevision,
      'x-expected-revision is invalid or missing',
    )
    return planWorkoutLinkClosureSchema.parse(
      await this.plans.unlinkWorkout(principal.userId, planId, linkId, revision),
    )
  }

  @Put(':planId/decision')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept, modify or skip a plan with optimistic revision control' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(planDecisionSchema) })
  @ApiOkResponse({ schema: openApiSchema(weeklyPlanSchema) })
  @ApiBadRequestResponse({ description: 'Decision or substitution is invalid.' })
  @ApiConflictResponse({ description: 'expectedRevision does not match.' })
  @ApiNotFoundResponse({ description: 'Plan does not exist for this user.' })
  async decide(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Body() body: unknown,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const input: PlanDecision = parse(planDecisionSchema, body, 'plan decision is invalid')
    return weeklyPlanSchema.parse(await this.plans.decide(principal.userId, planId, input))
  }

  @Get(':planId/history/:revision/outcome')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Recompute one exact accepted plan revision outcome review' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'revision', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ schema: openApiSchema(planOutcomeReviewSchema) })
  @ApiBadRequestResponse({ description: 'Plan identifier or revision is invalid.' })
  @ApiNotFoundResponse({ description: 'Accepted plan revision does not exist for this user.' })
  async outcome(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Param('revision') rawRevision: string,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const planRevision = parse(
      weeklyPlanRevisionSchema,
      rawRevision,
      'plan revision must be a positive integer',
    )
    return planOutcomeReviewSchema.parse(
      await this.plans.outcome(principal.userId, planId, planRevision),
    )
  }

  @Get(':planId/history/:revision/reflection')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read one user-confirmed reflection for an accepted plan revision' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'revision', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ schema: openApiSchema(planExperienceReflectionReadSchema) })
  @ApiNotFoundResponse({ description: 'Accepted plan revision does not exist for this user.' })
  async reflection(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Param('revision') rawRevision: string,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const planRevision = parse(
      weeklyPlanRevisionSchema,
      rawRevision,
      'plan revision must be a positive integer',
    )
    const reflection = await this.plans.reflection(principal.userId, planId, planRevision)
    return planExperienceReflectionReadSchema.parse({ planId, planRevision, reflection })
  }

  @Put(':planId/history/:revision/reflection')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create or correct one user-confirmed plan experience reflection' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'revision', schema: { type: 'integer', minimum: 1 } })
  @ApiBody({ schema: openApiSchema(writePlanExperienceReflectionSchema) })
  @ApiOkResponse({ schema: openApiSchema(planExperienceReflectionSchema) })
  @ApiConflictResponse({ description: 'Expected reflection revision does not match.' })
  @ApiNotFoundResponse({ description: 'Accepted plan revision does not exist for this user.' })
  async writeReflection(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Param('revision') rawRevision: string,
    @Body() body: unknown,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const planRevision = parse(
      weeklyPlanRevisionSchema,
      rawRevision,
      'plan revision must be a positive integer',
    )
    const input: WritePlanExperienceReflection = parse(
      writePlanExperienceReflectionSchema,
      body,
      'plan experience reflection is invalid',
    )
    return planExperienceReflectionSchema.parse(
      await this.plans.writeReflection(principal.userId, planId, planRevision, input),
    )
  }

  @Delete(':planId/history/:revision/reflection')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete one user-confirmed plan experience reflection' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'revision', schema: { type: 'integer', minimum: 1 } })
  @ApiHeader({ name: 'x-expected-revision', required: true })
  @ApiNoContentResponse({ description: 'Reflection content was deleted.' })
  @ApiConflictResponse({ description: 'Expected reflection revision does not match.' })
  @ApiNotFoundResponse({ description: 'Accepted plan revision or reflection does not exist.' })
  async deleteReflection(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Param('revision') rawRevision: string,
    @Headers('x-expected-revision') rawExpectedRevision: string | undefined,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const planRevision = parse(
      weeklyPlanRevisionSchema,
      rawRevision,
      'plan revision must be a positive integer',
    )
    const expectedRevision = parse(
      expectedRevisionHeaderSchema,
      rawExpectedRevision,
      'x-expected-revision is invalid or missing',
    )
    await this.plans.deleteReflection(principal.userId, planId, planRevision, expectedRevision)
  }

  @Get(':planId/history')
  @ApiOperation({ summary: 'Get immutable plan generation and decision history' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
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
  @ApiOkResponse({ schema: openApiSchema(weeklyPlanHistorySchema) })
  @ApiBadRequestResponse({ description: 'Plan identifier, history limit or cursor is invalid.' })
  @ApiNotFoundResponse({ description: 'Plan does not exist for this user.' })
  async history(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Query() query: unknown,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const parsed = parse(
      weeklyPlanHistoryQuerySchema,
      query,
      'weekly plan history query is invalid',
    )
    return weeklyPlanHistorySchema.parse(await this.plans.history(principal.userId, planId, parsed))
  }
}
