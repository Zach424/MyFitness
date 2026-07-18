import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from '@nestjs/common'
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
  aiExplanationHistorySchema,
  aiExplanationSchema,
  generateAiExplanationSchema,
  idempotencyKeySchema,
  weeklyPlanIdSchema,
  type GenerateAiExplanation,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { CurrentUser } from '../auth/current-user.decorator'
import { openApiSchema } from '../openapi-schema'
import { AiService } from './ai.service'

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

@ApiTags('ai explanations')
@Auth()
@Controller('plans/weekly')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post(':planId/explanation')
  @ApiOperation({ summary: 'Generate a review-only explanation for the current plan revision' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(generateAiExplanationSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(aiExplanationSchema) })
  @ApiBadRequestResponse({ description: 'Consent, revision or idempotency key is invalid.' })
  @ApiConflictResponse({ description: 'Plan changed or the same request is still in progress.' })
  @ApiNotFoundResponse({ description: 'Plan does not exist for this user.' })
  @ApiUnprocessableEntityResponse({ description: 'Current risk/profile state blocks explanation.' })
  async generate(
    @CurrentUser() principal: AuthPrincipal,
    @Param('planId') rawId: string,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: GenerateAiExplanation = parse(
      generateAiExplanationSchema,
      body,
      'AI explanation request is invalid',
    )
    return aiExplanationSchema.parse(await this.ai.generate(principal.userId, planId, key, input))
  }

  @Get(':planId/explanations')
  @ApiOperation({ summary: 'List immutable explanation runs for one owned weekly plan' })
  @ApiParam({ name: 'planId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: openApiSchema(aiExplanationHistorySchema) })
  @ApiNotFoundResponse({ description: 'Plan does not exist for this user.' })
  async history(@CurrentUser() principal: AuthPrincipal, @Param('planId') rawId: string) {
    const planId = parse(weeklyPlanIdSchema, rawId, 'planId must be a UUID')
    return aiExplanationHistorySchema.parse(await this.ai.history(principal.userId, planId))
  }
}
