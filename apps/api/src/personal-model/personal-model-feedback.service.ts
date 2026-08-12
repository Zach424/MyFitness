import { Injectable } from '@nestjs/common'
import {
  personalModelFeedbackWriteRequestSchema,
  personalModelFeedbackWriteResponseSchema,
  type PersonalModelFeedbackWriteRequest,
  type PersonalModelFeedbackWriteResponse,
} from '@myfitness/contracts'

import { projectPersonalModelFeedbackWriteResponse } from './personal-model-feedback'
import { PersonalModelRepository } from './personal-model.repository'

@Injectable()
export class PersonalModelFeedbackService {
  constructor(private readonly repository: PersonalModelRepository) {}

  async apply(
    userId: string,
    itemId: string,
    expectedRevision: number,
    input: PersonalModelFeedbackWriteRequest,
  ): Promise<PersonalModelFeedbackWriteResponse> {
    const request = personalModelFeedbackWriteRequestSchema.parse(input)
    const acceptedAt = new Date().toISOString()
    return personalModelFeedbackWriteResponseSchema.parse(
      projectPersonalModelFeedbackWriteResponse(
        await this.repository.applyFeedbackCommand(
          userId,
          itemId,
          expectedRevision,
          request,
          acceptedAt,
        ),
      ),
    )
  }
}
