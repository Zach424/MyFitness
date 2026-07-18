import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import * as z from 'zod'

export const openApiSchema = (schema: z.ZodType): SchemaObject => {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { target: 'openapi-3.0' })
  return jsonSchema as SchemaObject
}
