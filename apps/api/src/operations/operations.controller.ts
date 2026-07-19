import { Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common'
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AiService } from '../ai/ai.service'
import { InternalOperationsGuard } from './internal-operations.guard'
import { DataOperationsService } from './data-operations.service'
import { OperationalMetricsService } from './operational-metrics.service'
import { SkipRateLimit } from './rate-limit.decorator'

@ApiTags('operations')
@Controller('internal')
@SkipRateLimit()
@UseGuards(InternalOperationsGuard)
export class OperationsController {
  constructor(
    private readonly metrics: OperationalMetricsService,
    private readonly dataOperations: DataOperationsService,
    private readonly ai: AiService,
  ) {}

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

  @Get('data-operations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read aggregate durable data-operation queue health' })
  @ApiHeader({ name: 'x-operations-token', required: true })
  @ApiOkResponse({ description: 'Aggregate counts without object keys or user identifiers.' })
  @ApiUnauthorizedResponse({ description: 'Operations token is missing or invalid.' })
  dataOperationStatus() {
    return this.dataOperations.snapshot()
  }

  @Post('data-operations/drain')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Run one bounded durable data-operation drain pass' })
  @ApiHeader({ name: 'x-operations-token', required: true })
  @ApiOkResponse({ description: 'Bounded claim and success counts.' })
  @ApiUnauthorizedResponse({ description: 'Operations token is missing or invalid.' })
  drainDataOperations() {
    return this.dataOperations.drain()
  }

  @Get('ai-explanations')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read aggregate AI explanation run lifecycle health' })
  @ApiHeader({ name: 'x-operations-token', required: true })
  @ApiOkResponse({ description: 'Aggregate pending/reconciled counts without user content.' })
  @ApiUnauthorizedResponse({ description: 'Operations token is missing or invalid.' })
  aiExplanationStatus() {
    return this.ai.snapshot()
  }

  @Post('ai-explanations/reconcile')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Run one bounded expired AI explanation reconciliation pass' })
  @ApiHeader({ name: 'x-operations-token', required: true })
  @ApiOkResponse({ description: 'Count of runs moved to deterministic fallback.' })
  @ApiUnauthorizedResponse({ description: 'Operations token is missing or invalid.' })
  reconcileAiExplanations() {
    return this.ai.reconcileExpired()
  }
}
