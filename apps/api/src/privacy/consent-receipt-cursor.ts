import { BadRequestException } from '@nestjs/common'
import * as z from 'zod'

const consentReceiptCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    id: z.string().uuid(),
  })
  .strict()

export const encodeConsentReceiptCursor = (id: string) =>
  Buffer.from(JSON.stringify({ v: 1, id })).toString('base64url')

export const decodeConsentReceiptCursor = (value: string | undefined) => {
  if (!value) return null
  try {
    return consentReceiptCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    throw new BadRequestException('consent receipt cursor is invalid or expired')
  }
}
