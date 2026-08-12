import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import type { AuthPrincipal } from '../auth/auth.types'
import {
  PersonalModelCurrentSubjectUnavailableError,
  type PersonalModelCurrentSubjectViewService,
} from './personal-model-current-subject-view'
import { PersonalModelController } from './personal-model.controller'

const principal: AuthPrincipal = {
  userId: '2dd984bd-121c-4bdd-ae04-13b01f469294',
  sessionId: 'c1431944-73f8-4f64-a6d5-8bcde38bd685',
  provider: 'dev',
}

const createSubject = () => {
  const read = vi.fn<PersonalModelCurrentSubjectViewService['read']>()
  return {
    read,
    controller: new PersonalModelController({ read } as PersonalModelCurrentSubjectViewService),
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
})
