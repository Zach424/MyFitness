import { describe, expect, it, vi } from 'vitest'

import {
  createPersonalModelCurrentSubjectReader,
  parsePersonalModelCurrentSubjectResponse,
  PersonalModelCurrentSubjectResponseError,
} from './personal-model-current-subject-response'

const emptyFrequency = {
  schemaVersion: 'personal-model-current-subject-view-v1',
  subjectKey: 'training.recorded_frequency',
  current: null,
}

describe('personal model current-subject client adapter', () => {
  it('accepts an exact empty subject without treating it as a failed read', () => {
    expect(
      parsePersonalModelCurrentSubjectResponse('training.recorded_frequency', emptyFrequency),
    ).toEqual(emptyFrequency)
  })

  it.each([
    null,
    { ...emptyFrequency, subjectKey: 'training.availability' },
    { ...emptyFrequency, ownerUserId: '2dd984bd-121c-4bdd-ae04-13b01f469294' },
    { ...emptyFrequency, schemaVersion: 'personal-model-current-subject-view-v2' },
  ])('rejects malformed, expanded or request-mismatched responses %#', (value) => {
    expect(() =>
      parsePersonalModelCurrentSubjectResponse('training.recorded_frequency', value),
    ).toThrow(PersonalModelCurrentSubjectResponseError)
  })

  it('passes only the selected strict subject to its transport and parses the response', async () => {
    const transport = vi.fn().mockResolvedValue(emptyFrequency)
    const read = createPersonalModelCurrentSubjectReader(transport)

    await expect(read('training.recorded_frequency')).resolves.toEqual(emptyFrequency)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith('training.recorded_frequency')
  })

  it('preserves transport failures instead of converting them to an empty subject', async () => {
    const failure = Object.assign(new Error('request failed'), { statusCode: 503 })
    const read = createPersonalModelCurrentSubjectReader(vi.fn().mockRejectedValue(failure))

    await expect(read('training.availability')).rejects.toBe(failure)
  })
})
