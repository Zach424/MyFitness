import { applyDecorators, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { SessionAuthGuard } from './session-auth.guard'

export const Auth = () =>
  applyDecorators(
    UseGuards(SessionAuthGuard),
    ApiBearerAuth('bearer'),
    ApiUnauthorizedResponse({
      description: 'Bearer token is missing, invalid, expired or revoked.',
    }),
  )
