import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import {
  generateWeeklyPlanSchema,
  idempotencyKeySchema,
  planDecisionSchema,
  weeklyPlanHistorySchema,
  weeklyPlanIdSchema,
  weeklyPlanListSchema,
  weeklyPlanSchema,
  type GenerateWeeklyPlan,
  type PlanDecision,
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

  @Get(':planId/history')
  @ApiOperation({ summary: 'Get immutable plan generation and decision history' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: openApiSchema(weeklyPlanHistorySchema) })
  @ApiNotFoundResponse({ description: 'Plan does not exist for this user.' })
  async history(@CurrentUser() principal: AuthPrincipal, @Param('planId') rawId: string) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    return weeklyPlanHistorySchema.parse(await this.plans.history(principal.userId, planId))
  }
}
