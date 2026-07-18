import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { DatabaseService } from '../database/database.service'

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database readiness' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status', 'service', 'database', 'timestamp'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        service: { type: 'string', example: 'myfitness-api' },
        database: { type: 'string', enum: ['up'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  async readiness() {
    try {
      await this.database.ping()
      return {
        status: 'ok' as const,
        service: 'myfitness-api',
        database: 'up' as const,
        timestamp: new Date().toISOString(),
      }
    } catch {
      throw new ServiceUnavailableException('database is unavailable')
    }
  }
}
