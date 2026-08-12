import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { AuthPrincipal } from '../auth/auth.types'
import {
  PersonalModelCurrentSubjectUnavailableError,
  type PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'
import type { PersonalModelFeedbackService } from './personal-model-feedback.service'
import { PersonalModelController } from './personal-model.controller'
import {
  PersonalModelFeedbackAuthorityNotFoundError,
  PersonalModelRevisionConflictError,
} from './personal-model.repository'

const principal: AuthPrincipal = {
  userId: '2dd984bd-121c-4bdd-ae04-13b01f469294',
  sessionId: 'c1431944-73f8-4f64-a6d5-8bcde38bd685',
  provider: 'dev',
}

const createSubject = () => {
  const read = vi.fn<PersonalModelCurrentSubjectViewService['read']>()
  const apply = vi.fn<PersonalModelFeedbackService['apply']>()
  return {
    read,
    apply,
    controller: new PersonalModelController(
      { read } as PersonalModelCurrentSubjectViewService,
      { apply } as PersonalModelFeedbackService,
    ),
  }
}

describe('PersonalModelController', () => {
  it('parses the exact subject and returns the strict service view', async () => {
    const subject = createSubject()
    const view = {
      schemaVersion: 'personal-model-current-subject-view-v1' as const,
      subjectKey: 'training.recorded_frequency' as const,
      current: null,
    }
    subject.read.mockResolvedValue(view)

    await expect(
      subject.controller.readCurrentSubject(principal, 'training.recorded_frequency'),
    ).resolves.toEqual(view)
    expect(subject.read).toHaveBeenCalledWith(principal.userId, 'training.recorded_frequency')
  })

  it('rejects an unsupported subject before reading the repository', async () => {
    const subject = createSubject()

    await expect(
      subject.controller.readCurrentSubject(principal, 'training.unknown'),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(subject.read).not.toHaveBeenCalled()
  })

  it('maps only the unified authority error to an uninformative not-found response', async () => {
    const subject = createSubject()
    subject.read.mockRejectedValue(new PersonalModelCurrentSubjectUnavailableError())

    await expect(
      subject.controller.readCurrentSubject(principal, 'training.availability'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('preserves data conflicts as server failures instead of hiding them', async () => {
    const subject = createSubject()
    const conflict = new Error('ambiguous current generation')
    subject.read.mockRejectedValue(conflict)

    await expect(
      subject.controller.readCurrentSubject(principal, 'training.availability'),
    ).rejects.toBe(conflict)
  })

  it('binds feedback to the authenticated owner and exact target revision', async () => {
    const subject = createSubject()
    const input = {
      schemaVersion: 'personal-model-feedback-write-request-v1' as const,
      eventId: '44444444-4444-4444-8444-444444444444',
      choice: 'uncertain' as const,
      reasonCode: null,
      note: null,
      contextValidUntil: null,
    }
    const response = {
      schemaVersion: 'personal-model-feedback-write-response-v1' as const,
      outcome: 'revised' as const,
      eventId: input.eventId,
      itemId: '22222222-2222-4222-8222-222222222222',
      targetRevision: 2,
      currentRevision: 3,
      choice: 'uncertain' as const,
      feedbackState: 'uncertain' as const,
      status: 'active' as const,
      validTo: null,
      acceptedAt: '2026-08-12T08:00:00.000Z',
      noOpReason: null,
    }
    subject.apply.mockResolvedValue(response)

    await expect(
      subject.controller.applyFeedback(principal, response.itemId, '2', input),
    ).resolves.toEqual(response)
    expect(subject.apply).toHaveBeenCalledWith(principal.userId, response.itemId, 2, input)
  })

  it('rejects invalid feedback paths and bodies before service work', async () => {
    const subject = createSubject()
    const input = {
      schemaVersion: 'personal-model-feedback-write-request-v1',
      eventId: '44444444-4444-4444-8444-444444444444',
      choice: 'uncertain',
      reasonCode: null,
      note: null,
      contextValidUntil: null,
    }

    await expect(
      subject.controller.applyFeedback(principal, 'not-an-id', '1', input),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      subject.controller.applyFeedback(principal, '22222222-2222-4222-8222-222222222222', '0', {
        ...input,
        choice: 'unknown',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(subject.apply).not.toHaveBeenCalled()
  })

  it('maps unavailable authority to 404 and stale targets to 409', async () => {
    const input = {
      schemaVersion: 'personal-model-feedback-write-request-v1',
      eventId: '44444444-4444-4444-8444-444444444444',
      choice: 'uncertain',
      reasonCode: null,
      note: null,
      contextValidUntil: null,
    }
    const itemId = '22222222-2222-4222-8222-222222222222'
    const unavailable = createSubject()
    unavailable.apply.mockRejectedValue(new PersonalModelFeedbackAuthorityNotFoundError())
    await expect(
      unavailable.controller.applyFeedback(principal, itemId, '1', input),
    ).rejects.toBeInstanceOf(NotFoundException)

    const stale = createSubject()
    stale.apply.mockRejectedValue(new PersonalModelRevisionConflictError())
    await expect(
      stale.controller.applyFeedback(principal, itemId, '1', input),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
