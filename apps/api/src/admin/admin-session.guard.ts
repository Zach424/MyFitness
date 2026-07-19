import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'

import { AdminAuthService } from './admin-auth.service'
import type { AdminAuthenticatedRequest } from './admin.types'

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminAuthenticatedRequest>()
    const requestId = request.requestId ?? randomFallbackRequestId
    const rawAuthorization = request.headers.authorization
    const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization
    const [scheme, token] = authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      await this.auth.recordDenied(requestId, 'bearer_required')
      throw new UnauthorizedException('administrator Bearer token is required')
    }
    request.operator = await this.auth.authenticate(token, requestId)
    return true
  }
}

const randomFallbackRequestId = '00000000-0000-4000-8000-000000000000'
