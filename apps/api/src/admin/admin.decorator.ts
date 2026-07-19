import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { AdminRole } from '@myfitness/contracts'

import { adminRolesMetadata } from './admin.constants'
import { AdminRoleGuard } from './admin-role.guard'
import { AdminSessionGuard } from './admin-session.guard'

export const AdminAuth = (...roles: AdminRole[]) =>
  applyDecorators(
    SetMetadata(adminRolesMetadata, roles),
    UseGuards(AdminSessionGuard, AdminRoleGuard),
    ApiBearerAuth('adminBearer'),
    ApiUnauthorizedResponse({ description: 'Administrator session is missing or invalid.' }),
    ApiForbiddenResponse({ description: 'Administrator role does not permit this operation.' }),
  )
