import {
  type CallHandler,
  type ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { describe, expect, it, vi } from 'vitest'

import { OperationalMetricsService } from './operational-metrics.service'
import { RateLimitInterceptor } from './rate-limit.interceptor'
import type { RateLimitService } from './rate-limit.service'

describe('RateLimitInterceptor', () => {
  it('fails a business request closed when shared Redis protection is unavailable', async () => {
    const request = {
      headers: {},
      method: 'POST',
      ip: '127.0.0.1',
      requestId: 'ccf5e1d0-5e7f-468a-8cc4-ff74db96a548',
    }
    const response = { statusCode: 200, setHeader: vi.fn() }
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key.includes('skip')
          ? false
          : { name: 'api_test', limit: 2, windowSeconds: 60, scope: 'ip' },
      ),
    } as unknown as Reflector
    const rateLimits = {
      consume: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as RateLimitService
    const metrics = new OperationalMetricsService()
    const interceptor = new RateLimitInterceptor(reflector, rateLimits, metrics)
    const logError = vi
      .spyOn(
        (interceptor as unknown as { logger: { error(message: string): void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined)
    const next = { handle: vi.fn() } as unknown as CallHandler

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(next.handle).not.toHaveBeenCalled()
    expect(metrics.render()).toContain('myfitness_rate_limit_backend_failures_total 1')
    expect(logError).toHaveBeenCalledOnce()
  })
})
