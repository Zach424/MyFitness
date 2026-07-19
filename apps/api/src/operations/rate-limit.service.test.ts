import { describe, expect, it, vi } from 'vitest'

import type { RedisService } from './redis.service'
import { RateLimitService } from './rate-limit.service'

describe('RateLimitService', () => {
  it('hashes the actor before writing an atomic Redis window', async () => {
    const incrementWindow = vi.fn().mockResolvedValue({ count: 2, ttlMs: 12_001 })
    const service = new RateLimitService({ incrementWindow } as unknown as RedisService)

    const result = await service.consume(
      { name: 'api_test', limit: 4, windowSeconds: 30 },
      'user:6bdf19d9-c40b-4235-9d59-7fb9c599a06f',
    )

    expect(result).toEqual({
      allowed: true,
      count: 2,
      limit: 4,
      remaining: 2,
      resetAfterSeconds: 13,
    })
    const [key, windowMs] = incrementWindow.mock.calls[0] as [string, number]
    expect(key).toMatch(/^myfitness:rate:v1:api_test:[0-9a-f]{64}$/)
    expect(key).not.toContain('6bdf19d9')
    expect(windowMs).toBe(30_000)
  })

  it('rejects invalid policies before touching Redis', async () => {
    const incrementWindow = vi.fn()
    const service = new RateLimitService({ incrementWindow } as unknown as RedisService)

    await expect(
      service.consume({ name: 'Bad Policy', limit: 0, windowSeconds: 0 }, 'ip:127.0.0.1'),
    ).rejects.toThrow('policy name')
    expect(incrementWindow).not.toHaveBeenCalled()
  })
})
