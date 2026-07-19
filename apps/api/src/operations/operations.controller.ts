import { Controller, Get, Header, UseGuards } from '@nestjs/common'
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { InternalOperationsGuard } from './internal-operations.guard'
import { OperationalMetricsService } from './operational-metrics.service'
import { SkipRateLimit } from './rate-limit.decorator'

@ApiTags('operations')
@Controller('internal')
@SkipRateLimit()
@UseGuards(InternalOperationsGuard)
export class OperationsController {
  constructor(private readonly metrics: OperationalMetricsService) {}

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Read process-local Prometheus metrics using the operations token' })
  @ApiHeader({ name: 'x-operations-token', required: true })
  @ApiOkResponse({ description: 'Prometheus text exposition without user identifiers.' })
  @ApiUnauthorizedResponse({ description: 'Operations token is missing or invalid.' })
  metricsText() {
    return this.metrics.render()
  }
}
