import { BadRequestException, Body, Controller, Get, HttpCode, Put } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import {
  onboardingBaseSchema,
  onboardingRequestSchema,
  onboardingResponseSchema,
  type OnboardingRequest,
} from '@myfitness/contracts'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { OnboardingService } from './onboarding.service'

const parseRequest = (body: unknown): OnboardingRequest => {
  const result = onboardingRequestSchema.safeParse(body)
  if (!result.success) {
    throw new BadRequestException({
      message: 'onboarding request is invalid',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}

@ApiTags('onboarding')
@Auth()
@Controller('me/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Put()
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or revise the authenticated adult profile and goals' })
  @ApiBody({ schema: openApiSchema(onboardingBaseSchema) })
  @ApiOkResponse({ schema: openApiSchema(onboardingResponseSchema) })
  @ApiBadRequestResponse({ description: 'Profile, goal, risk or consent input is invalid.' })
  @ApiConflictResponse({ description: 'expectedRevision does not match the stored profile.' })
  async upsert(@CurrentUser() principal: AuthPrincipal, @Body() body: unknown) {
    return onboardingResponseSchema.parse(
      await this.onboarding.upsert(principal.userId, parseRequest(body)),
    )
  }

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user profile, goals and consent receipts' })
  @ApiOkResponse({ schema: openApiSchema(onboardingResponseSchema) })
  @ApiNotFoundResponse({ description: 'Onboarding has not been completed.' })
  async get(@CurrentUser() principal: AuthPrincipal) {
    return onboardingResponseSchema.parse(await this.onboarding.get(principal.userId))
  }
}
