import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import {
  personalModelCurrentSubjectViewSchema,
  personalModelFeedbackWriteRequestSchema,
  personalModelFeedbackWriteResponseSchema,
  personalModelSubjectKeySchema,
  personalModelSubjectKeys,
} from '@myfitness/contracts'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { PersonalModelFeedbackService } from './personal-model-feedback.service'
import {
  PersonalModelCurrentSubjectUnavailableError,
  PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'
import {
  PersonalModelFeedbackAuthorityNotFoundError,
  PersonalModelItemNotFoundError,
  PersonalModelRevisionConflictError,
} from './personal-model.repository'
import * as z from 'zod'

const personalModelItemIdSchema = z.string().uuid()
const personalModelRevisionSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647))

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

@ApiTags('personal model')
@Auth()
@Controller('personal-model')
export class PersonalModelController {
  constructor(
    private readonly currentSubject: PersonalModelCurrentSubjectViewService,
    private readonly feedback: PersonalModelFeedbackService,
  ) {}

  @Get('subjects/:subjectKey/current')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the current owner-visible item for one personal-model subject' })
  @ApiParam({ name: 'subjectKey', enum: personalModelSubjectKeys })
  @ApiOkResponse({ schema: openApiSchema(personalModelCurrentSubjectViewSchema) })
  @ApiBadRequestResponse({ description: 'The personal-model subject is not supported.' })
  @ApiNotFoundResponse({ description: 'The current subject is unavailable for this principal.' })
  @ApiInternalServerErrorResponse({
    description: 'The current personal-model projection failed closed.',
  })
  async readCurrentSubject(
    @CurrentUser() principal: AuthPrincipal,
    @Param('subjectKey') rawSubjectKey: string,
  ) {
    const subjectKey = personalModelSubjectKeySchema.safeParse(rawSubjectKey)
    if (!subjectKey.success) {
      throw new BadRequestException({
        message: 'personal model subject is invalid',
        issues: subjectKey.error.issues.map((issue) => ({
          path: 'subjectKey',
          message: issue.message,
        })),
      })
    }

    try {
      return personalModelCurrentSubjectViewSchema.parse(
        await this.currentSubject.read(principal.userId, subjectKey.data),
      )
    } catch (error) {
      if (error instanceof PersonalModelCurrentSubjectUnavailableError) {
        throw new NotFoundException()
      }
      throw error
    }
  }

  @Post('items/:itemId/revisions/:revision/feedback')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Apply authenticated feedback to one exact personal-model revision' })
  @ApiParam({ name: 'itemId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'revision', schema: { type: 'integer', minimum: 1 } })
  @ApiBody({ schema: openApiSchema(personalModelFeedbackWriteRequestSchema) })
  @ApiOkResponse({ schema: openApiSchema(personalModelFeedbackWriteResponseSchema) })
  @ApiBadRequestResponse({ description: 'The feedback request or target path is invalid.' })
  @ApiConflictResponse({ description: 'The target is stale, terminal or reuses an event ID.' })
  @ApiNotFoundResponse({ description: 'The feedback target is unavailable for this principal.' })
  @ApiInternalServerErrorResponse({ description: 'The feedback transaction failed closed.' })
  async applyFeedback(
    @CurrentUser() principal: AuthPrincipal,
    @Param('itemId') rawItemId: string,
    @Param('revision') rawRevision: string,
    @Body() body: unknown,
  ) {
    const itemId = parse(personalModelItemIdSchema, rawItemId, 'personal model itemId is invalid')
    const revision = parse(
      personalModelRevisionSchema,
      rawRevision,
      'personal model revision is invalid',
    )
    const input = parse(
      personalModelFeedbackWriteRequestSchema,
      body,
      'personal model feedback request is invalid',
    )

    try {
      return personalModelFeedbackWriteResponseSchema.parse(
        await this.feedback.apply(principal.userId, itemId, revision, input),
      )
    } catch (error) {
      if (
        error instanceof PersonalModelFeedbackAuthorityNotFoundError ||
        error instanceof PersonalModelItemNotFoundError
      ) {
        throw new NotFoundException()
      }
      if (error instanceof PersonalModelRevisionConflictError) {
        throw new ConflictException()
      }
      throw error
    }
  }
}
