import { timingSafeEqual } from 'node:crypto'

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { getRuntimeConfig } from '../config'
import type { OperationalRequest } from './operations.types'

@Injectable()
export class InternalOperationsGuard implements CanActivate {
  private readonly expected = Buffer.from(getRuntimeConfig().operationsToken)

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OperationalRequest>()
    const raw = request.headers['x-operations-token']
    const token = Array.isArray(raw) ? raw[0] : raw
    if (!token) throw new UnauthorizedException('operations token is required')
    const received = Buffer.from(token)
    if (received.length !== this.expected.length || !timingSafeEqual(received, this.expected)) {
      throw new UnauthorizedException('operations token is invalid')
    }
    return true
  }
}
