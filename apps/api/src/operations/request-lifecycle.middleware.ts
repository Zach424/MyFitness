import { Logger } from '@nestjs/common'

import {
  OperationalMetricsService,
  operationalHttpMethod,
  operationalHttpStatus,
} from './operational-metrics.service'
import type { OperationalRequest, OperationalResponse } from './operations.types'

type LifecycleRequest = OperationalRequest & {
  route?: { path?: string | string[] }
}

type LifecycleResponse = OperationalResponse & {
  once(event: 'finish', listener: () => void): void
}

const stableRoute = (request: LifecycleRequest) => {
  const raw = request.route?.path
  const route = Array.isArray(raw) ? raw[0] : raw
  return typeof route === 'string' && route.startsWith('/') ? route : '/unmatched'
}

export const createRequestLifecycleMiddleware = (metrics: OperationalMetricsService) => {
  const logger = new Logger('HttpRequest')
  return (request: LifecycleRequest, response: LifecycleResponse, next: () => void) => {
    const startedAt = process.hrtime.bigint()
    response.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
      const route = stableRoute(request)
      const method = operationalHttpMethod(request.method)
      const status = operationalHttpStatus(response.statusCode)
      metrics.observeRequest(method, route, status, durationSeconds)
      const event = JSON.stringify({
        event: 'http_request',
        requestId: request.requestId,
        method,
        route,
        status,
        durationMs: Number((durationSeconds * 1_000).toFixed(2)),
        actor: request.operator ? 'operator' : request.user ? 'authenticated' : 'anonymous',
      })
      if (status >= 500) logger.error(event)
      else if (status === 429) logger.warn(event)
      else logger.log(event)
    })
    next()
  }
}
