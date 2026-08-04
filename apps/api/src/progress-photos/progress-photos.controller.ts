import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import {
  createProgressPhotoSchema,
  idempotencyKeySchema,
  progressPhotoIdSchema,
  progressPhotoItemSchema,
  progressPhotoListSchema,
  progressPhotoMaxBytes,
  progressPhotoTicketSchema,
  type CreateProgressPhoto,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { ProgressPhotosService } from './progress-photos.service'

type MemoryUpload = { buffer: Buffer; mimetype: string; size: number }

const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new BadRequestException({
      message,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}

@ApiTags('progress photos')
@Controller('progress-photos')
export class ProgressPhotosController {
  constructor(private readonly photos: ProgressPhotosService) {}

  @Post()
  @Auth()
  @RateLimit(rateLimitPolicies.photoReservation)
  @ApiOperation({ summary: 'Reserve a private progress-photo capture check' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(createProgressPhotoSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(progressPhotoTicketSchema) })
  @ApiBadRequestResponse({ description: 'Current analysis/retention consent is invalid.' })
  @ApiConflictResponse({ description: 'Reservation, account or capture time conflicts.' })
  async reserve(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: CreateProgressPhoto = parse(
      createProgressPhotoSchema,
      body,
      'progress photo request is invalid',
    )
    return progressPhotoTicketSchema.parse(await this.photos.reserve(principal.userId, key, input))
  }

  @Post(':photoId/upload')
  @Auth()
  @RateLimit(rateLimitPolicies.photoUpload)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: progressPhotoMaxBytes, files: 1 } }),
  )
  @ApiOperation({ summary: 'Sanitize, store and check one private progress photo' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ schema: openApiSchema(progressPhotoItemSchema) })
  @ApiBadRequestResponse({ description: 'Image bytes or signed upload token are invalid.' })
  @ApiConflictResponse({ description: 'Reservation is no longer uploadable.' })
  async upload(
    @CurrentUser() principal: AuthPrincipal,
    @Param('photoId') rawId: string,
    @Query('token') token: string | undefined,
    @UploadedFile() file: MemoryUpload | undefined,
  ) {
    const id = parse(progressPhotoIdSchema, rawId, 'photoId must be a UUID')
    if (!token || !file) throw new BadRequestException('signed token and file are required')
    return progressPhotoItemSchema.parse(
      await this.photos.upload(principal.userId, id, token, file),
    )
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'List owner-visible progress photos' })
  @ApiOkResponse({ schema: openApiSchema(progressPhotoListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return this.photos.list(principal.userId)
  }

  @Get(':photoId/preview')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Content-Type', 'image/jpeg')
  @ApiOperation({ summary: 'Read a sanitized progress preview using a short-lived signature' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiNotFoundResponse({ description: 'Preview is deleted, expired or unavailable.' })
  async preview(@Param('photoId') rawId: string, @Query('token') token: string | undefined) {
    const id = parse(progressPhotoIdSchema, rawId, 'photoId must be a UUID')
    if (!token) throw new BadRequestException('signed preview token is required')
    return new StreamableFile(await this.photos.preview(id, token))
  }

  @Delete(':photoId')
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one private progress photo and its capture analysis' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Progress photo and capture analysis were deleted.' })
  @ApiNotFoundResponse({ description: 'Progress photo is unavailable for this user.' })
  async remove(@CurrentUser() principal: AuthPrincipal, @Param('photoId') rawId: string) {
    const id = parse(progressPhotoIdSchema, rawId, 'photoId must be a UUID')
    await this.photos.remove(principal.userId, id)
  }
}
