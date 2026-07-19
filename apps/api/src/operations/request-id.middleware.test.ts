import { describe, expect, it, vi } from 'vitest'

import type { OperationalRequest, OperationalResponse } from './operations.types'
import { isRequestId, requestIdMiddleware } from './request-id.middleware'

const run = (incoming?: string) => {
  const request = {
    headers: incoming ? { 'x-request-id': incoming } : {},
    method: 'GET',
  } satisfies OperationalRequest
  const headers = new Map<string, string>()
  const response = {
    statusCode: 200,
    setHeader: (name: string, value: string | number) => headers.set(name, String(value)),
  } satisfies OperationalResponse
  const next = vi.fn()
  requestIdMiddleware(request, response, next)
  return { request, headers, next }
}

describe('requestIdMiddleware', () => {
  it('preserves a valid UUID v4 and exposes it on the response', () => {
    const value = 'A5D97364-E697-4B99-90B3-46AC8C3FA5B7'
    const result = run(value)

    expect(result.request.requestId).toBe(value.toLowerCase())
    expect(result.headers.get('X-Request-ID')).toBe(value.toLowerCase())
    expect(result.next).toHaveBeenCalledOnce()
  })

  it('replaces untrusted log input with a generated UUID v4', () => {
    const result = run('line-break\nsecret')

    expect(result.request.requestId).not.toContain('secret')
    expect(isRequestId(result.request.requestId!)).toBe(true)
    expect(result.headers.get('X-Request-ID')).toBe(result.request.requestId)
  })
})
