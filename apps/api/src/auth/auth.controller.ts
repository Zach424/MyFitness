import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  devSessionRequestSchema,
  devSessionSchema,
  type DevSessionRequest,
} from '@myfitness/contracts'

import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { AuthService } from './auth.service'

const parseRequest = (body: unknown): DevSessionRequest => {
  const result = devSessionRequestSchema.safeParse(body)
  if (!result.success) throw new BadRequestException('development session request is invalid')
  return result.data
}

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('dev/session')
  @RateLimit(rateLimitPolicies.authSession)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create a local-only opaque session',
    description: 'Disabled when NODE_ENV=production. Replace with WeChat/phone verification.',
  })
  @ApiBody({ schema: openApiSchema(devSessionRequestSchema) })
  @ApiOkResponse({ schema: openApiSchema(devSessionSchema) })
  async createDevSession(@Body() body: unknown) {
    return devSessionSchema.parse(await this.auth.createDevSession(parseRequest(body)))
  }
}
