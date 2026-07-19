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
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import {
  accountDeletionIntentSchema,
  accountDeletionRequestSchema,
  accountDeletionResultSchema,
  consentRevocationRequestSchema,
  consentRevocationResultSchema,
  privacyOverviewSchema,
  revocableConsentPurposeSchema,
  erasureReceiptTokenSchema,
  type AccountDeletionRequest,
  type ConsentRevocationRequest,
} from '@myfitness/contracts'
import type { ZodType } from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { PrivacyService } from './privacy.service'

const parseBody = <T>(schema: ZodType<T>, body: unknown, message: string) => {
  const result = schema.safeParse(body)
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

@ApiTags('privacy')
@Auth()
@Controller('me/privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @ApiOperation({ summary: 'Inspect the authenticated account data inventory and consent state' })
  @ApiOkResponse({ schema: openApiSchema(privacyOverviewSchema) })
  async overview(@CurrentUser() principal: AuthPrincipal) {
    return privacyOverviewSchema.parse(await this.privacy.overview(principal.userId))
  }

  @Get('export')
  @RateLimit(rateLimitPolicies.privacyExport)
  @ApiOperation({ summary: 'Download a versioned portable JSON export without session secrets' })
  @ApiProduces('application/json')
  @ApiOkResponse({ description: 'Versioned JSON attachment containing account-owned data.' })
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  async portableExport(@CurrentUser() principal: AuthPrincipal) {
    const payload = await this.privacy.portableExport(principal.userId)
    return new StreamableFile(Buffer.from(`${JSON.stringify(payload, null, 2)}\n`), {
      type: 'application/json; charset=utf-8',
      disposition: 'attachment; filename="myfitness-export.json"',
    })
  }

  @Post('consents/:purpose/revoke')
  @RateLimit(rateLimitPolicies.privacyRevocation)
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke an optional AI or food-photo consent and stop pending work' })
  @ApiOkResponse({ schema: openApiSchema(consentRevocationResultSchema) })
  @ApiBadRequestResponse({ description: 'Only optional consent purposes can be revoked.' })
  @ApiNotFoundResponse({ description: 'The optional consent has never been granted.' })
  async revoke(
    @CurrentUser() principal: AuthPrincipal,
    @Param('purpose') rawPurpose: string,
    @Body() body: unknown,
  ) {
    const purpose = revocableConsentPurposeSchema.safeParse(rawPurpose)
    if (!purpose.success) throw new BadRequestException('consent purpose is not revocable')
    parseBody<ConsentRevocationRequest>(
      consentRevocationRequestSchema,
      body,
      'consent revocation request is invalid',
    )
    return consentRevocationResultSchema.parse(
      await this.privacy.revokeConsent(principal.userId, purpose.data),
    )
  }

  @Post('account-deletion-intents')
  @RateLimit(rateLimitPolicies.accountErasureIntent)
  @HttpCode(201)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Create a short-lived, single-use account deletion intent',
    description:
      'The returned secret must be persisted by the client before deletion and becomes the receipt recovery credential after commit.',
  })
  @ApiCreatedResponse({ schema: openApiSchema(accountDeletionIntentSchema) })
  async createDeletionIntent(@CurrentUser() principal: AuthPrincipal) {
    return accountDeletionIntentSchema.parse(
      await this.privacy.createDeletionIntent(principal.userId),
    )
  }

  @Delete('account')
  @RateLimit(rateLimitPolicies.accountErasure)
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue durable account, media and restore-ledger erasure' })
  @ApiAcceptedResponse({ schema: openApiSchema(accountDeletionResultSchema) })
  @ApiBadRequestResponse({
    description: 'The exact deletion phrase and acknowledgement are required.',
  })
  @ApiConflictResponse({ description: 'The account is not active or deletion state changed.' })
  @ApiHeader({ name: 'X-Erasure-Intent-Token', required: true })
  async deleteAccount(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-erasure-intent-token') rawIntentToken: string | undefined,
    @Body() body: unknown,
  ) {
    const intentToken = erasureReceiptTokenSchema.safeParse(rawIntentToken)
    if (!intentToken.success) {
      throw new UnauthorizedException('account deletion intent is invalid or expired')
    }
    const input = parseBody<AccountDeletionRequest>(
      accountDeletionRequestSchema,
      body,
      'account deletion request is invalid',
    )
    return accountDeletionResultSchema.parse(
      await this.privacy.deleteAccount(principal.userId, input, intentToken.data),
    )
  }
}
