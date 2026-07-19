import { BadRequestException, Body, Controller, Header, HttpCode, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { supportUserLookupRequestSchema, supportUserSummarySchema } from '@myfitness/contracts'

import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { AdminSupportService } from './admin-support.service'
import { AdminAuth } from './admin.decorator'
import { CurrentAdminRequestId, CurrentOperator } from './current-operator.decorator'
import type { AdminPrincipal } from './admin.types'

@ApiTags('administrator support')
@AdminAuth('support_reader')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Post('users/lookup')
  @Header('Cache-Control', 'no-store, private')
  @RateLimit(rateLimitPolicies.adminSupport)
  @HttpCode(200)
  @ApiOperation({ summary: 'Look up one exact account and return only bounded support evidence' })
  @ApiOkResponse({ schema: openApiSchema(supportUserSummarySchema) })
  @ApiBadRequestResponse({ description: 'Exact account, ticket and reason are required.' })
  @ApiNotFoundResponse({ description: 'The exact account does not exist; the attempt is audited.' })
  async lookup(
    @CurrentOperator() principal: AdminPrincipal,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
    @Body() body: unknown,
  ) {
    const input = supportUserLookupRequestSchema.safeParse(body)
    if (!input.success) throw new BadRequestException('administrator support lookup is invalid')
    return this.support.lookup(
      principal,
      input.data,
      rawRequestId ?? '00000000-0000-4000-8000-000000000000',
    )
  }
}
