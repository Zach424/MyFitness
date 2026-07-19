import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { OperationalMetricsService } from './operational-metrics.service'
import type { OperationalRequest, OperationalResponse, RateLimitPolicy } from './operations.types'
import { rateLimitPolicyMetadata, skipRateLimitMetadata } from './rate-limit.decorator'
import { rateLimitPolicies } from './rate-limit.policies'
import { RateLimitService } from './rate-limit.service'
import { routeTemplate } from './route-template'

export const defaultRateLimitPolicy: RateLimitPolicy = rateLimitPolicies.standard

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
    private readonly metrics: OperationalMetricsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const skipped = this.reflector.getAllAndOverride<boolean>(skipRateLimitMetadata, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skipped) return next.handle()

    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy>(rateLimitPolicyMetadata, [
        context.getHandler(),
        context.getClass(),
      ]) ?? defaultRateLimitPolicy
    const request = context.switchToHttp().getRequest<OperationalRequest>()
    const response = context.switchToHttp().getResponse<OperationalResponse>()
    const remoteAddress = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    const actor =
      policy.scope === 'ip'
        ? `ip:${remoteAddress}`
        : request.user
          ? `user:${request.user.userId}`
          : policy.scope === 'user'
            ? null
            : `ip:${remoteAddress}`
    if (!actor) {
      throw new ServiceUnavailableException({
        code: 'rate_limit_identity_unavailable',
        message: '请求身份尚未建立。',
        requestId: request.requestId,
      })
    }

    try {
      const decision = await this.rateLimits.consume(policy, actor)
      response.setHeader('RateLimit-Limit', decision.limit)
      response.setHeader('RateLimit-Remaining', decision.remaining)
      response.setHeader('RateLimit-Reset', decision.resetAfterSeconds)
      if (!decision.allowed) {
        response.setHeader('Retry-After', decision.resetAfterSeconds)
        this.metrics.recordRateLimitRejection(policy.name)
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'rate_limit_exceeded',
            message: '请求过于频繁，请稍后重试。',
            requestId: request.requestId,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.metrics.recordRateLimitBackendFailure()
      this.logger.error(
        JSON.stringify({
          event: 'rate_limit_backend_failure',
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
    return next.handle()
  }
}
