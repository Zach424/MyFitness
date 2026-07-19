import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import {
  adminDevSessionRequestSchema,
  adminOidcExchangeRequestSchema,
  adminOperatorSchema,
  adminSessionSchema,
  type AdminDevSessionRequest,
} from '@myfitness/contracts'

import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { AdminAuthService } from './admin-auth.service'
import { AdminAuth } from './admin.decorator'
import { CurrentAdminRequestId, CurrentOperator } from './current-operator.decorator'
import type { AdminPrincipal } from './admin.types'

const requestId = (value: string | undefined) => value ?? '00000000-0000-4000-8000-000000000000'

@ApiTags('administrator authentication')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('dev/session')
  @Header('Cache-Control', 'no-store, private')
  @RateLimit(rateLimitPolicies.adminAuth)
  @HttpCode(200)
  @ApiOperation({ summary: 'Create a local-only administrator session' })
  @ApiOkResponse({ schema: openApiSchema(adminSessionSchema) })
  @ApiBadRequestResponse({ description: 'The development operator request is invalid.' })
  @ApiNotFoundResponse({ description: 'The development issuer is disabled in production.' })
  async createDevSession(
    @Body() body: unknown,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
  ) {
    const parsed = adminDevSessionRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('administrator dev session is invalid')
    return adminSessionSchema.parse(
      await this.auth.createDevSession(
        parsed.data as AdminDevSessionRequest,
        requestId(rawRequestId),
      ),
    )
  }

  @Post('oidc/exchange')
  @Header('Cache-Control', 'no-store, private')
  @RateLimit(rateLimitPolicies.adminAuth)
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange one verified, pre-provisioned OIDC identity token' })
  @ApiOkResponse({ schema: openApiSchema(adminSessionSchema) })
  @ApiBadRequestResponse({ description: 'The OIDC exchange request is invalid.' })
  async exchangeOidc(
    @Body() body: unknown,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
  ) {
    const parsed = adminOidcExchangeRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('administrator OIDC exchange is invalid')
    return adminSessionSchema.parse(
      await this.auth.exchangeOidc(parsed.data.idToken, parsed.data.nonce, requestId(rawRequestId)),
    )
  }

  @Get('me')
  @Header('Cache-Control', 'no-store, private')
  @AdminAuth()
  @ApiOperation({ summary: 'Read the current administrator identity and least-privilege roles' })
  @ApiOkResponse({ schema: openApiSchema(adminOperatorSchema) })
  async me(
    @CurrentOperator() principal: AdminPrincipal,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
  ) {
    return this.auth.profile(principal, requestId(rawRequestId))
  }

  @Delete('session')
  @Header('Cache-Control', 'no-store, private')
  @AdminAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current administrator API session' })
  @ApiNoContentResponse()
  async revoke(
    @CurrentOperator() principal: AdminPrincipal,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
  ) {
    await this.auth.revoke(principal, requestId(rawRequestId))
  }
}
