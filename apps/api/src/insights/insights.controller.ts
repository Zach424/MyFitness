import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { dashboardQuerySchema, dashboardSchema } from '@myfitness/contracts'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { InsightsService } from './insights.service'

@ApiTags('insights')
@Auth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregate confirmed evidence for Today and 7/30/90-day trends' })
  @ApiOkResponse({ schema: openApiSchema(dashboardSchema) })
  @ApiBadRequestResponse({ description: 'Timezone or reference timestamp is invalid.' })
  async dashboard(
    @CurrentUser() principal: AuthPrincipal,
    @Query('timezone') timezone: string | undefined,
    @Query('at') at: string | undefined,
  ) {
    const parsed = dashboardQuerySchema.safeParse({ timezone, ...(at ? { at } : {}) })
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'dashboard query is invalid',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    return dashboardSchema.parse(
      await this.insights.dashboard(
        principal.userId,
        parsed.data.timezone,
        parsed.data.at ? new Date(parsed.data.at) : new Date(),
      ),
    )
  }
}
