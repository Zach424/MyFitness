import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import {
  personalModelCurrentSubjectViewSchema,
  personalModelSubjectKeySchema,
  personalModelSubjectKeys,
} from '@myfitness/contracts'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import {
  PersonalModelCurrentSubjectUnavailableError,
  PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'

@ApiTags('personal model')
@Auth()
@Controller('personal-model')
export class PersonalModelController {
  constructor(private readonly currentSubject: PersonalModelCurrentSubjectViewService) {}

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
}
