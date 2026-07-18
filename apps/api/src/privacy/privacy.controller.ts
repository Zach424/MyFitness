import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import {
  accountDeletionRequestSchema,
  accountDeletionResultSchema,
  consentRevocationRequestSchema,
  consentRevocationResultSchema,
  privacyOverviewSchema,
  revocableConsentPurposeSchema,
  type AccountDeletionRequest,
  type ConsentRevocationRequest,
} from '@myfitness/contracts'
import type { ZodType } from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
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

  @Delete('account')
  @HttpCode(200)
  @ApiOperation({ summary: 'Permanently erase the authenticated account and private photo media' })
  @ApiOkResponse({ schema: openApiSchema(accountDeletionResultSchema) })
  @ApiBadRequestResponse({
    description: 'The exact deletion phrase and acknowledgement are required.',
  })
  @ApiConflictResponse({ description: 'The account is not active or deletion state changed.' })
  async deleteAccount(@CurrentUser() principal: AuthPrincipal, @Body() body: unknown) {
    const input = parseBody<AccountDeletionRequest>(
      accountDeletionRequestSchema,
      body,
      'account deletion request is invalid',
    )
    return accountDeletionResultSchema.parse(
      await this.privacy.deleteAccount(principal.userId, input),
    )
  }
}
