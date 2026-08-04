import { BadRequestException } from '@nestjs/common'
import * as z from 'zod'

const recordCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    id: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .strict()

export type RecordPageCursor = z.infer<typeof recordCursorPayloadSchema>

export const encodeRecordPageCursor = (value: Omit<RecordPageCursor, 'v'>) =>
  Buffer.from(JSON.stringify({ v: 1, id: value.id, revision: value.revision })).toString(
    'base64url',
  )

export const decodeRecordPageCursor = (
  value: string | undefined,
  resourceLabel: string,
): RecordPageCursor | null => {
  if (!value) return null
  try {
    return recordCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
  } catch {
    throw new BadRequestException(`${resourceLabel} cursor is invalid or expired`)
  }
}
