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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import {
  confirmFoodPhotoCandidateSchema,
  createFoodPhotoCandidateSchema,
  foodPhotoAnalysisSchema,
  foodPhotoConfirmationSchema,
  foodPhotoIdSchema,
  foodPhotoListSchema,
  foodPhotoMaxBytes,
  foodPhotoTicketSchema,
  idempotencyKeySchema,
  type ConfirmFoodPhotoCandidate,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { RateLimit } from '../operations/rate-limit.decorator'
import { rateLimitPolicies } from '../operations/rate-limit.policies'
import { PhotoCandidatesService } from './photo-candidates.service'

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

@ApiTags('nutrition photo candidates')
@Controller('nutrition/photo-candidates')
export class PhotoCandidatesController {
  constructor(private readonly photos: PhotoCandidatesService) {}

  @Post()
  @Auth()
  @RateLimit(rateLimitPolicies.photoReservation)
  @ApiOperation({ summary: 'Reserve a private, expiring food-photo analysis upload' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(createFoodPhotoCandidateSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(foodPhotoTicketSchema) })
  @ApiBadRequestResponse({ description: 'Explicit current-version consent is required.' })
  @ApiConflictResponse({ description: 'Reservation or consent state conflicts.' })
  async reserve(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    parse(createFoodPhotoCandidateSchema, body, 'food photo consent is invalid')
    return this.photos.reserve(principal.userId, key)
  }

  @Post(':photoId/upload')
  @Auth()
  @RateLimit(rateLimitPolicies.photoUpload)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: foodPhotoMaxBytes, files: 1 } }))
  @ApiOperation({ summary: 'Upload, sanitize and analyze one private food photo' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ schema: openApiSchema(foodPhotoAnalysisSchema) })
  @ApiBadRequestResponse({ description: 'Image bytes or signed upload token are invalid.' })
  @ApiConflictResponse({ description: 'Reservation is no longer uploadable.' })
  async upload(
    @CurrentUser() principal: AuthPrincipal,
    @Param('photoId') rawId: string,
    @Query('token') token: string | undefined,
    @UploadedFile() file: MemoryUpload | undefined,
  ) {
    const id = parse(foodPhotoIdSchema, rawId, 'photoId must be a UUID')
    if (!token || !file) throw new BadRequestException('signed token and file are required')
    return foodPhotoAnalysisSchema.parse(
      await this.photos.upload(principal.userId, id, token, file),
    )
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'List recent reviewable food-photo candidates' })
  @ApiOkResponse({ schema: openApiSchema(foodPhotoListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return foodPhotoListSchema.parse(await this.photos.list(principal.userId))
  }

  @Get(':photoId/preview')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Content-Type', 'image/jpeg')
  @ApiOperation({ summary: 'Read a sanitized private preview using a short-lived signature' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiNotFoundResponse({ description: 'Preview is deleted, expired or unavailable.' })
  async preview(@Param('photoId') rawId: string, @Query('token') token: string | undefined) {
    const id = parse(foodPhotoIdSchema, rawId, 'photoId must be a UUID')
    if (!token) throw new BadRequestException('signed preview token is required')
    return new StreamableFile(await this.photos.preview(id, token))
  }

  @Post(':photoId/confirm')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm selected candidates and immediately delete the photo' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(confirmFoodPhotoCandidateSchema) })
  @ApiOkResponse({ schema: openApiSchema(foodPhotoConfirmationSchema) })
  @ApiNotFoundResponse({ description: 'Photo candidate is unavailable for this user.' })
  @ApiUnprocessableEntityResponse({
    description: 'Selection is outside displayed candidates or ranges.',
  })
  async confirm(
    @CurrentUser() principal: AuthPrincipal,
    @Param('photoId') rawId: string,
    @Body() body: unknown,
  ) {
    const id = parse(foodPhotoIdSchema, rawId, 'photoId must be a UUID')
    const input: ConfirmFoodPhotoCandidate = parse(
      confirmFoodPhotoCandidateSchema,
      body,
      'food photo confirmation is invalid',
    )
    return foodPhotoConfirmationSchema.parse(await this.photos.confirm(principal.userId, id, input))
  }

  @Delete(':photoId')
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete private photo media and derived candidate content' })
  @ApiParam({ name: 'photoId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Private photo and derived content were deleted.' })
  @ApiNotFoundResponse({ description: 'Photo candidate is unavailable for this user.' })
  async remove(@CurrentUser() principal: AuthPrincipal, @Param('photoId') rawId: string) {
    const id = parse(foodPhotoIdSchema, rawId, 'photoId must be a UUID')
    await this.photos.remove(principal.userId, id)
  }
}
