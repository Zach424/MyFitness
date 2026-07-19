import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { erasureReceiptStatusSchema, erasureReceiptTokenSchema } from '@myfitness/contracts'
import * as z from 'zod'

import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { PrivacyService } from './privacy.service'

@ApiTags('privacy')
@Controller('privacy/erasure-receipts')
export class ErasureReceiptsController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('recover')
  @RateLimit(rateLimitPolicies.erasureReceipt)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Recover minimal erasure progress after a committed deletion response was lost',
  })
  @ApiHeader({ name: 'X-Erasure-Receipt-Token', required: true })
  @ApiOkResponse({ schema: openApiSchema(erasureReceiptStatusSchema) })
  @ApiUnauthorizedResponse({ description: 'Receipt secret is invalid.' })
  async recover(@Headers('x-erasure-receipt-token') rawToken: string | undefined) {
    const token = erasureReceiptTokenSchema.safeParse(rawToken)
    if (!token.success) throw new UnauthorizedException('erasure receipt token is invalid')
    return erasureReceiptStatusSchema.parse(await this.privacy.recoverErasureReceipt(token.data))
  }

  @Get(':receiptId')
  @RateLimit(rateLimitPolicies.erasureReceipt)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Read minimal erasure progress using the one-time receipt secret' })
  @ApiParam({ name: 'receiptId', format: 'uuid' })
  @ApiHeader({ name: 'X-Erasure-Receipt-Token', required: true })
  @ApiOkResponse({ schema: openApiSchema(erasureReceiptStatusSchema) })
  @ApiUnauthorizedResponse({ description: 'Receipt identifier or secret is invalid.' })
  async status(
    @Param('receiptId') rawReceiptId: string,
    @Headers('x-erasure-receipt-token') rawToken: string | undefined,
  ) {
    const receiptId = z.string().uuid().safeParse(rawReceiptId)
    const token = erasureReceiptTokenSchema.safeParse(rawToken)
    if (!receiptId.success || !token.success) {
      throw new UnauthorizedException('erasure receipt token is invalid')
    }
    return erasureReceiptStatusSchema.parse(
      await this.privacy.erasureReceipt(receiptId.data, token.data),
    )
  }
}
