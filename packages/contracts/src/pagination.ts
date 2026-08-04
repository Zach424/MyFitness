import * as z from 'zod'

export const recordPageCursorSchema = z
  .string()
  .min(24)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/)

export const recordListQuerySchema = (defaultLimit: number, maximumLimit: number) =>
  z
    .object({
      limit: z.coerce.number().int().min(1).max(maximumLimit).default(defaultLimit),
      cursor: recordPageCursorSchema.optional(),
    })
    .strict()
