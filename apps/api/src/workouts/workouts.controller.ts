import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
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
  createWorkoutSchema,
  expectedRevisionHeaderSchema,
  idempotencyKeySchema,
  updateWorkoutBaseSchema,
  updateWorkoutSchema,
  workoutBaseSchema,
  workoutHistorySchema,
  workoutIdSchema,
  workoutListSchema,
  workoutSchema,
  type CreateWorkout,
  type UpdateWorkout,
} from '@myfitness/contracts'
import * as z from 'zod'

import { Auth } from '../auth/auth.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import type { AuthPrincipal } from '../auth/auth.types'
import { openApiSchema } from '../openapi-schema'
import { WorkoutsService } from './workouts.service'

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

@ApiTags('workouts')
@Auth()
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an idempotent structured workout session' })
  @ApiHeader({ name: 'x-idempotency-key', required: true })
  @ApiBody({ schema: openApiSchema(workoutBaseSchema) })
  @ApiCreatedResponse({ schema: openApiSchema(workoutSchema) })
  @ApiBadRequestResponse({ description: 'Workout structure, time or feedback is invalid.' })
  @ApiConflictResponse({ description: 'Idempotency key was reused with different content.' })
  async create(
    @CurrentUser() principal: AuthPrincipal,
    @Headers('x-idempotency-key') rawKey: string | undefined,
    @Body() body: unknown,
  ) {
    const key = parse(idempotencyKeySchema, rawKey, 'x-idempotency-key is invalid or missing')
    const input: CreateWorkout = parse(createWorkoutSchema, body, 'workout is invalid')
    return workoutSchema.parse(await this.workouts.create(principal.userId, key, input))
  }

  @Get()
  @ApiOperation({ summary: 'List the latest 50 workout sessions' })
  @ApiOkResponse({ schema: openApiSchema(workoutListSchema) })
  async list(@CurrentUser() principal: AuthPrincipal) {
    return workoutListSchema.parse(await this.workouts.list(principal.userId))
  }

  @Put(':workoutId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Replace a workout using optimistic revision control' })
  @ApiParam({ name: 'workoutId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: openApiSchema(updateWorkoutBaseSchema) })
  @ApiOkResponse({ schema: openApiSchema(workoutSchema) })
  @ApiConflictResponse({ description: 'expectedRevision does not match.' })
  @ApiNotFoundResponse({ description: 'Workout does not exist for this user.' })
  async update(
    @CurrentUser() principal: AuthPrincipal,
    @Param('workoutId') rawId: string,
    @Body() body: unknown,
  ) {
    const id = parse(workoutIdSchema, rawId, 'workoutId must be a UUID')
    const input: UpdateWorkout = parse(updateWorkoutSchema, body, 'workout update is invalid')
    return workoutSchema.parse(await this.workouts.update(principal.userId, id, input))
  }

  @Delete(':workoutId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a workout using optimistic revision control' })
  @ApiParam({ name: 'workoutId', schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'x-expected-revision', required: true })
  @ApiNoContentResponse({ description: 'Workout was removed from routine lists.' })
  @ApiConflictResponse({ description: 'Expected revision does not match.' })
  @ApiNotFoundResponse({ description: 'Workout does not exist for this user.' })
  async remove(
    @CurrentUser() principal: AuthPrincipal,
    @Param('workoutId') rawId: string,
    @Headers('x-expected-revision') rawRevision: string | undefined,
  ) {
    const id = parse(workoutIdSchema, rawId, 'workoutId must be a UUID')
    const revision = parse(
      expectedRevisionHeaderSchema,
      rawRevision,
      'x-expected-revision is invalid or missing',
    )
    await this.workouts.remove(principal.userId, id, revision)
  }

  @Get(':workoutId/history')
  @ApiOperation({ summary: 'Get immutable workout revisions' })
  @ApiParam({ name: 'workoutId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ schema: openApiSchema(workoutHistorySchema) })
  @ApiNotFoundResponse({ description: 'Workout does not exist for this user.' })
  async history(@CurrentUser() principal: AuthPrincipal, @Param('workoutId') rawId: string) {
    const id = parse(workoutIdSchema, rawId, 'workoutId must be a UUID')
    return workoutHistorySchema.parse(await this.workouts.history(principal.userId, id))
  }
}
