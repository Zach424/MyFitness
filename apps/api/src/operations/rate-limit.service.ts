import { createHmac } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { getRuntimeConfig } from '../config'
import type { RateLimitDecision, RateLimitPolicy } from './operations.types'
import { RedisService } from './redis.service'

@Injectable()
export class RateLimitService {
  private readonly config = getRuntimeConfig()

  constructor(private readonly redis: RedisService) {}

  async consume(policy: RateLimitPolicy, actor: string): Promise<RateLimitDecision> {
    if (!/^[a-z][a-z0-9_-]{1,48}$/.test(policy.name)) {
      throw new Error('rate-limit policy name is invalid')
    }
    if (!Number.isInteger(policy.limit) || policy.limit < 1 || policy.limit > 100_000) {
      throw new Error('rate-limit policy limit is invalid')
    }
    if (
      !Number.isInteger(policy.windowSeconds) ||
      policy.windowSeconds < 1 ||
      policy.windowSeconds > 86_400
    ) {
      throw new Error('rate-limit policy window is invalid')
    }
    const actorHash = createHmac('sha256', this.config.rateLimitHashSecret)
      .update(actor)
      .digest('hex')
    const key = `${this.config.rateLimitKeyPrefix}:${policy.name}:${actorHash}`
    const { count, ttlMs } = await this.redis.incrementWindow(key, policy.windowSeconds * 1_000)
    return {
      allowed: count <= policy.limit,
      count,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - count),
      resetAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
    }
  }
}
