import { describe, expect, it, vi } from 'vitest'

import type { DatabaseService } from '../database/database.service'
import {
  PersonalModelRepository,
  PersonalModelRevisionConflictError,
} from './personal-model.repository'

describe('personal model current subject repository', () => {
  it('uses one owner-scoped query and fails closed if the database returns ambiguous current rows', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}, {}] })
    const repository = new PersonalModelRepository({ query } as unknown as DatabaseService)
    const userId = '11111111-1111-4111-8111-111111111111'

    await expect(
      repository.getCurrentSubject(userId, 'training.recorded_frequency'),
    ).rejects.toThrow(
      new PersonalModelRevisionConflictError(
        'personal model current subject generation is ambiguous',
      ),
    )
    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('item.retired_at IS NULL'), [
      userId,
      'training.recorded_frequency',
    ])
  })
})
