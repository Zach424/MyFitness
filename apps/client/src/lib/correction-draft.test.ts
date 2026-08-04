import { describe, expect, it } from 'vitest'

import {
  correctionDraftTarget,
  currentCorrectionTarget,
  isCorrectionDraftTarget,
} from './correction-draft'

const aggregate = {
  id: '0190d8f9-89ca-7cc4-8e3a-a5f3e74c6eb8',
  revision: 2,
  title: 'current',
}

describe('correction draft target', () => {
  it('accepts only an exact UUID and positive base revision', () => {
    expect(isCorrectionDraftTarget(correctionDraftTarget(aggregate))).toBe(true)
    expect(isCorrectionDraftTarget({ ...correctionDraftTarget(aggregate), owner: 'other' })).toBe(
      false,
    )
    expect(isCorrectionDraftTarget({ aggregateId: aggregate.id, baseRevision: 0 })).toBe(false)
    expect(isCorrectionDraftTarget({ aggregateId: 'not-a-uuid', baseRevision: 2 })).toBe(false)
  })

  it('returns a target only while the same aggregate revision is current', () => {
    expect(currentCorrectionTarget([aggregate], correctionDraftTarget(aggregate))).toBe(aggregate)
    expect(
      currentCorrectionTarget([{ ...aggregate, revision: 3 }], correctionDraftTarget(aggregate)),
    ).toBeNull()
    expect(currentCorrectionTarget([], correctionDraftTarget(aggregate))).toBeNull()
  })
})
