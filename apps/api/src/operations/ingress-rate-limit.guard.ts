import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { OperationalMetricsService } from './operational-metrics.service'
import type { OperationalRequest, OperationalResponse } from './operations.types'
import { skipRateLimitMetadata } from './rate-limit.decorator'
import { rateLimitPolicies } from './rate-limit.policies'
import { RateLimitService } from './rate-limit.service'
import { routeTemplate } from './route-template'

@Injectable()
export class IngressRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(IngressRateLimitGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
    private readonly metrics: OperationalMetricsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const skipped = this.reflector.getAllAndOverride<boolean>(skipRateLimitMetadata, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skipped) return true

    const request = context.switchToHttp().getRequest<OperationalRequest>()
    const response = context.switchToHttp().getResponse<OperationalResponse>()
    const remoteAddress = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    const policy = rateLimitPolicies.ingress
    try {
      const decision = await this.rateLimits.consume(policy, `ip:${remoteAddress}`)
      response.setHeader('RateLimit-Limit', decision.limit)
      response.setHeader('RateLimit-Remaining', decision.remaining)
      response.setHeader('RateLimit-Reset', decision.resetAfterSeconds)
      if (!decision.allowed) {
        response.setHeader('Retry-After', decision.resetAfterSeconds)
        this.metrics.recordRateLimitRejection(policy.name)
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'ingress_rate_limit_exceeded',
            message: '请求过于频繁，请稍后重试。',
            requestId: request.requestId,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
      return true
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.metrics.recordRateLimitBackendFailure()
      this.logger.error(
        JSON.stringify({
          event: 'ingress_rate_limit_backend_failure',
          requestId: request.requestId,
          route: routeTemplate(context),
          policy: policy.name,
        }),
      )
      throw new ServiceUnavailableException({
        code: 'rate_limit_backend_unavailable',
        message: '请求保护服务暂不可用。',
        requestId: request.requestId,
      })
    }
  }
}
