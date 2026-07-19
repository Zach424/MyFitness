import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { AdminAuthenticatedRequest } from './admin.types'

export const CurrentOperator = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AdminAuthenticatedRequest>()
  return request.operator
})

export const CurrentAdminRequestId = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AdminAuthenticatedRequest>()
    return request.requestId
  },
)
