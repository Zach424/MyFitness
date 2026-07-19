import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { DatabaseService } from '../database/database.service'
import { RedisService } from '../operations/redis.service'
import { ObjectStorageService } from '../operations/object-storage.service'
import { SkipRateLimit } from '../operations/rate-limit.decorator'

@ApiTags('system')
@Controller('health')
@SkipRateLimit()
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the API process is alive without dependencies' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'service', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['alive'] },
        service: { type: 'string', example: 'myfitness-api' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  liveness() {
    return {
      status: 'alive' as const,
      service: 'myfitness-api',
      timestamp: new Date().toISOString(),
    }
  }

  @Get()
  @ApiOperation({ summary: 'Check API and database readiness' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'service', 'database', 'redis', 'objectStorage', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        service: { type: 'string', example: 'myfitness-api' },
        database: { type: 'string', enum: ['up'] },
        redis: { type: 'string', enum: ['up'] },
        objectStorage: { type: 'string', enum: ['up'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  async readiness() {
    try {
      await Promise.all([this.database.ping(), this.redis.ping(), this.objectStorage.ping()])
      return {
        status: 'ok' as const,
        service: 'myfitness-api',
        database: 'up' as const,
        redis: 'up' as const,
        objectStorage: 'up' as const,
        timestamp: new Date().toISOString(),
      }
    } catch {
      throw new ServiceUnavailableException('readiness dependency is unavailable')
    }
  }
}
