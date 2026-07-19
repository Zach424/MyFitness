import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AdminRole } from '@myfitness/contracts'

import { AdminAuditService } from './admin-audit.service'
import { adminRolesMetadata } from './admin.constants'
import type { AdminAuthenticatedRequest } from './admin.types'

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AdminAuditService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(adminRolesMetadata, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required?.length) return true

    const request = context.switchToHttp().getRequest<AdminAuthenticatedRequest>()
    const operator = request.operator
    if (operator && required.some((role) => operator.roles.includes(role))) return true

    await this.audit.append({
      operatorId: operator?.operatorId,
      action: 'authorization.denied',
      outcome: 'denied',
      targetType: operator ? 'operator' : null,
      target: operator?.operatorId,
      requestId: request.requestId ?? '00000000-0000-4000-8000-000000000000',
      details: { requiredRole: required.join('|') },
    })
    throw new ForbiddenException('administrator role does not permit this operation')
  }
}
