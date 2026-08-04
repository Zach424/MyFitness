import type { ProgressPhotoItem } from '@myfitness/contracts'
import { describe, expect, it } from 'vitest'

import {
  defaultComparisonPair,
  qualityReasonCopy,
  retainedPhotosForView,
  selectedComparisonPair,
} from './progress-photo.model'

const photo = (
  id: string,
  view: ProgressPhotoItem['view'],
  retentionMode: ProgressPhotoItem['retentionMode'],
) =>
  ({
    id,
    view,
    retentionMode,
  }) as ProgressPhotoItem

describe('progress photo presentation model', () => {
  it('only offers retained photos from the same view for comparison', () => {
    const items = [
      photo('new-front', 'front', 'retained'),
      photo('old-front', 'front', 'retained'),
      photo('temporary-front', 'front', 'analysis_only'),
      photo('side', 'side', 'retained'),
    ]
    expect(retainedPhotosForView(items, 'front').map((item) => item.id)).toEqual([
      'new-front',
      'old-front',
    ])
  })

  it('falls back to the latest two photos when a selected pair is incomplete', () => {
    const items = [photo('new', 'front', 'retained'), photo('old', 'front', 'retained')]
    expect(defaultComparisonPair(items)).toMatchObject({
      current: { id: 'new' },
      baseline: { id: 'old' },
    })
    expect(selectedComparisonPair(items, 'missing', 'new')).toMatchObject({
      current: { id: 'new' },
      baseline: { id: 'old' },
    })
  })

  it('uses guidance language rather than diagnostic labels', () => {
    expect(qualityReasonCopy.image_too_dark).toContain('画面偏暗')
    expect(Object.values(qualityReasonCopy).join('')).not.toMatch(/诊断|体脂|异常体态/)
  })
})
