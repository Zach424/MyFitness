import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { adminAuditListQuerySchema, adminAuditListSchema } from '@myfitness/contracts'

import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { AdminAuditQueryService } from './admin-audit-query.service'
import { AdminAuth } from './admin.decorator'
import { CurrentAdminRequestId, CurrentOperator } from './current-operator.decorator'
import type { AdminPrincipal } from './admin.types'

@ApiTags('administrator audit')
@AdminAuth('audit_reader')
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditQueryService) {}

  @Get()
  @Header('Cache-Control', 'no-store, private')
  @RateLimit(rateLimitPolicies.adminAudit)
  @ApiOperation({ summary: 'Read a bounded page of append-only administrator access events' })
  @ApiOkResponse({ schema: openApiSchema(adminAuditListSchema) })
  @ApiBadRequestResponse({ description: 'Audit pagination input is invalid.' })
  async list(
    @CurrentOperator() principal: AdminPrincipal,
    @CurrentAdminRequestId() rawRequestId: string | undefined,
    @Query() query: unknown,
  ) {
    const parsed = adminAuditListQuerySchema.safeParse(query)
    if (!parsed.success) throw new BadRequestException('administrator audit query is invalid')
    return this.audit.list(
      principal,
      parsed.data,
      rawRequestId ?? '00000000-0000-4000-8000-000000000000',
    )
  }
}
