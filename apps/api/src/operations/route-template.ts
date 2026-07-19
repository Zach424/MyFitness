import { PATH_METADATA } from '@nestjs/common/constants'
import type { ExecutionContext } from '@nestjs/common'

const firstPath = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' ? candidate : ''
}

export const routeTemplate = (context: ExecutionContext) => {
  const controller = firstPath(Reflect.getMetadata(PATH_METADATA, context.getClass()))
  const handler = firstPath(Reflect.getMetadata(PATH_METADATA, context.getHandler()))
  const joined = ['v1', controller, handler]
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')
  return `/${joined}`
}
