import { Injectable } from '@nestjs/common'
import {
  personalModelCurrentSubjectEnvelopeSchema,
  personalModelCurrentSubjectViewSchema,
  personalModelCurrentSubjectViewVersion,
  type PersonalModelCurrentSubjectEnvelope,
  type PersonalModelCurrentSubjectView,
  type PersonalModelSubjectKey,
} from '@myfitness/contracts'

import {
  PersonalModelRepository,
  PersonalModelSubjectAuthorityNotFoundError,
} from './personal-model.repository'

export const projectPersonalModelCurrentSubjectView = (
  input: PersonalModelCurrentSubjectEnvelope,
): PersonalModelCurrentSubjectView => {
  const envelope = personalModelCurrentSubjectEnvelopeSchema.parse(input)
  if (envelope.current === null) {
    return personalModelCurrentSubjectViewSchema.parse({
      schemaVersion: personalModelCurrentSubjectViewVersion,
      subjectKey: envelope.subjectKey,
      current: null,
    })
  }

  const { currentRevision, generation, terminal } = envelope.current
  const item = currentRevision.snapshot
  return personalModelCurrentSubjectViewSchema.parse({
    schemaVersion: personalModelCurrentSubjectViewVersion,
    subjectKey: envelope.subjectKey,
    current: {
      itemId: item.id,
      generation,
      revision: item.revision,
      kind: item.kind,
      claimSchemaVersion: item.claimSchemaVersion,
      claim: item.claim,
      source: item.source,
      status: item.status,
      feedbackState: item.feedbackState,
      terminal,
      confidence: {
        level: item.confidence.level,
        limitations: item.confidence.limitations,
      },
      evidence: {
        asOf: item.evidenceSet.asOf,
        window: item.evidenceSet.window,
        qualifiedCount: item.evidenceSet.includedCount,
        supportingCount: item.evidenceSet.supportingCount,
        contradictingCount: item.evidenceSet.contradictingCount,
        withdrawnCount: item.evidenceSet.withdrawnCount,
      },
      validFrom: item.validFrom,
      validTo: item.validTo,
      observedFrom: item.observedFrom,
      observedThrough: item.observedThrough,
      derivedAt: item.derivedAt,
      updatedAt: item.updatedAt,
    },
  })
}

export class PersonalModelCurrentSubjectUnavailableError extends Error {
  constructor() {
    super('personal model current subject is unavailable')
    this.name = 'PersonalModelCurrentSubjectUnavailableError'
  }
}

@Injectable()
export class PersonalModelCurrentSubjectViewService {
  constructor(private readonly repository: PersonalModelRepository) {}

  async read(
    userId: string,
    subjectKey: PersonalModelSubjectKey,
  ): Promise<PersonalModelCurrentSubjectView> {
    try {
      return projectPersonalModelCurrentSubjectView(
        await this.repository.getCurrentSubject(userId, subjectKey),
      )
    } catch (error) {
      if (error instanceof PersonalModelSubjectAuthorityNotFoundError) {
        throw new PersonalModelCurrentSubjectUnavailableError()
      }
      throw error
    }
  }
}
