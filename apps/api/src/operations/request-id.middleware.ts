import { randomUUID } from 'node:crypto'

import type { OperationalRequest, OperationalResponse } from './operations.types'

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Next = () => void

export const requestIdMiddleware = (
  request: OperationalRequest,
  response: OperationalResponse,
  next: Next,
) => {
  const incoming = request.headers['x-request-id']
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming
  const requestId =
    candidate && requestIdPattern.test(candidate) ? candidate.toLowerCase() : randomUUID()
  request.requestId = requestId
  response.setHeader('X-Request-ID', requestId)
  next()
}

export const isRequestId = (value: string) => requestIdPattern.test(value)
