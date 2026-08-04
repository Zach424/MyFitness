import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  dashboardQuerySchema,
  dashboardSchema,
  exerciseInsightQuerySchema,
  exerciseInsightSchema,
  exerciseKeySchema,
  healthInsightQuerySchema,
  healthInsightSchema,
  metricCodeSchema,
  nutritionInsightQuerySchema,
  nutritionInsightSchema,
} from '@myfitness/contracts'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { InsightsService } from './insights.service'

@ApiTags('insights')
@Auth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregate confirmed evidence for Today and 7/30/90-day trends' })
  @ApiOkResponse({ schema: openApiSchema(dashboardSchema) })
  @ApiBadRequestResponse({ description: 'Timezone or reference timestamp is invalid.' })
  async dashboard(
    @CurrentUser() principal: AuthPrincipal,
    @Query('timezone') timezone: string | undefined,
    @Query('at') at: string | undefined,
  ) {
    const parsed = dashboardQuerySchema.safeParse({ timezone, ...(at ? { at } : {}) })
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'dashboard query is invalid',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    return dashboardSchema.parse(
      await this.insights.dashboard(
        principal.userId,
        parsed.data.timezone,
        parsed.data.at ? new Date(parsed.data.at) : new Date(),
      ),
    )
  }

  @Get('nutrition')
  @ApiOperation({
    summary: 'Aggregate current meal evidence into 90 timezone-aware local days',
  })
  @ApiOkResponse({ schema: openApiSchema(nutritionInsightSchema) })
  @ApiBadRequestResponse({ description: 'Timezone or reference timestamp is invalid.' })
  async nutrition(
    @CurrentUser() principal: AuthPrincipal,
    @Query('timezone') timezone: string | undefined,
    @Query('at') at: string | undefined,
  ) {
    const parsed = nutritionInsightQuerySchema.safeParse({ timezone, ...(at ? { at } : {}) })
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'nutrition insight query is invalid',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    return nutritionInsightSchema.parse(
      await this.insights.nutrition(
        principal.userId,
        parsed.data.timezone,
        parsed.data.at ? new Date(parsed.data.at) : new Date(),
      ),
    )
  }

  @Get('health/:metric')
  @ApiOperation({
    summary: 'Aggregate confirmed current evidence for one exact health metric',
  })
  @ApiOkResponse({ schema: openApiSchema(healthInsightSchema) })
  @ApiBadRequestResponse({ description: 'Metric, timezone or reference timestamp is invalid.' })
  async health(
    @CurrentUser() principal: AuthPrincipal,
    @Param('metric') metric: string,
    @Query('timezone') timezone: string | undefined,
    @Query('at') at: string | undefined,
  ) {
    const parsedMetric = metricCodeSchema.safeParse(metric)
    const parsedQuery = healthInsightQuerySchema.safeParse({ timezone, ...(at ? { at } : {}) })
    if (!parsedMetric.success || !parsedQuery.success) {
      throw new BadRequestException({
        message: 'health insight query is invalid',
        issues: [
          ...(parsedMetric.success
            ? []
            : parsedMetric.error.issues.map((issue) => ({
                path: 'metric',
                message: issue.message,
              }))),
          ...(parsedQuery.success
            ? []
            : parsedQuery.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }))),
        ],
      })
    }
    return healthInsightSchema.parse(
      await this.insights.health(
        principal.userId,
        parsedMetric.data,
        parsedQuery.data.timezone,
        parsedQuery.data.at ? new Date(parsedQuery.data.at) : new Date(),
      ),
    )
  }

  @Get('exercises/:exerciseKey')
  @ApiOperation({
    summary: 'Aggregate completed-set evidence for one stable exercise identity',
  })
  @ApiOkResponse({ schema: openApiSchema(exerciseInsightSchema) })
  @ApiBadRequestResponse({
    description: 'Exercise key, timezone or reference timestamp is invalid.',
  })
  async exercise(
    @CurrentUser() principal: AuthPrincipal,
    @Param('exerciseKey') exerciseKey: string,
    @Query('timezone') timezone: string | undefined,
    @Query('at') at: string | undefined,
  ) {
    const parsedKey = exerciseKeySchema.safeParse(exerciseKey)
    const parsedQuery = exerciseInsightQuerySchema.safeParse({ timezone, ...(at ? { at } : {}) })
    if (!parsedKey.success || !parsedQuery.success) {
      throw new BadRequestException({
        message: 'exercise insight query is invalid',
        issues: [
          ...(parsedKey.success
            ? []
            : parsedKey.error.issues.map((issue) => ({
                path: 'exerciseKey',
                message: issue.message,
              }))),
          ...(parsedQuery.success
            ? []
            : parsedQuery.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }))),
        ],
      })
    }
    return exerciseInsightSchema.parse(
      await this.insights.exercise(
        principal.userId,
        parsedKey.data,
        parsedQuery.data.timezone,
        parsedQuery.data.at ? new Date(parsedQuery.data.at) : new Date(),
      ),
    )
  }
}
