import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { createClient } from 'redis'

import { getRuntimeConfig } from '../config'

const fixedWindowScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`

const buildClient = (url: string) =>
  createClient({
    url,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: false,
    },
  })

type MyFitnessRedisClient = ReturnType<typeof buildClient>

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private readonly url = getRuntimeConfig().redisUrl
  private client?: MyFitnessRedisClient
  private connecting?: Promise<void>

  private newClient() {
    const client = buildClient(this.url)
    client.on('error', () => this.logger.warn('Redis connection error'))
    return client
  }

  private async ready() {
    if (this.client?.isReady) return this.client
    if (this.client?.isOpen && !this.client.isReady && !this.connecting) {
      this.client.destroy()
      this.client = undefined
    }
    const client = this.client ?? this.newClient()
    this.client = client
    if (!this.connecting) {
      this.connecting = client
        .connect()
        .then(() => undefined)
        .catch((error) => {
          if (client.isOpen) client.destroy()
          if (this.client === client) this.client = undefined
          throw error
        })
        .finally(() => {
          this.connecting = undefined
        })
    }
    await this.connecting
    if (!client.isReady) throw new Error('Redis is not ready')
    return client
  }

  async ping() {
    const client = await this.ready()
    return client.ping()
  }

  async incrementWindow(key: string, windowMs: number) {
    const client = await this.ready()
    const result = await client.eval(fixedWindowScript, {
      keys: [key],
      arguments: [String(windowMs)],
    })
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Redis rate-limit response is invalid')
    }
    const count = Number(result[0])
    const ttlMs = Number(result[1])
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(ttlMs)) {
      throw new Error('Redis rate-limit counters are invalid')
    }
    return { count, ttlMs: Math.max(1, ttlMs) }
  }

  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy()
    this.client = undefined
  }
}
