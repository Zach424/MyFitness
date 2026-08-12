import { describe, expect, it } from 'vitest'

import {
  canonicalMuscleModelCatalog,
  muscleDefinitionSchema,
  muscleIdSchema,
  muscleIds,
  muscleModelCatalog,
  muscleModelCatalogSchema,
  muscleModelVersion,
  muscleRegionIds,
} from './muscle-model'

describe('muscle model contracts', () => {
  it('publishes one strict, versioned hierarchy for all consumers', () => {
    expect(muscleModelCatalogSchema.parse(muscleModelCatalog)).toEqual(canonicalMuscleModelCatalog)
    expect(canonicalMuscleModelCatalog.version).toBe('ilens-muscle-model-v1')
    expect(canonicalMuscleModelCatalog.regions.map(({ id }) => id)).toEqual([
      'chest',
      'back',
      'shoulders_arms',
      'legs_glutes',
      'core',
    ])
    expect(muscleModelVersion).toBe('ilens-muscle-model-v1')
  })

  it('freezes all 26 v1 muscle identities in canonical display order', () => {
    expect(canonicalMuscleModelCatalog.muscles.map(({ id }) => id)).toEqual([
      'chest_upper',
      'chest_middle',
      'chest_lower',
      'latissimus_dorsi',
      'trapezius',
      'rhomboids',
      'teres_major',
      'teres_minor',
      'erector_spinae',
      'deltoid_anterior',
      'deltoid_lateral',
      'deltoid_posterior',
      'biceps_brachii',
      'triceps_brachii',
      'brachialis',
      'forearms',
      'gluteus_maximus',
      'gluteus_medius',
      'quadriceps',
      'hamstrings',
      'adductors',
      'gastrocnemius',
      'soleus',
      'rectus_abdominis',
      'obliques',
      'core_global',
    ])
    expect(canonicalMuscleModelCatalog.muscles).toHaveLength(26)
    expect(muscleIds).toHaveLength(26)
  })

  it('keeps each muscle under exactly one region with contiguous local ordering', () => {
    expect(muscleRegionIds).toHaveLength(5)
    for (const regionId of muscleRegionIds) {
      const children = canonicalMuscleModelCatalog.muscles.filter(
        (muscle) => muscle.regionId === regionId,
      )
      expect(children.length).toBeGreaterThan(0)
      expect(children.map(({ displayOrder }) => displayOrder)).toEqual(
        Array.from({ length: children.length }, (_, index) => index + 1),
      )
    }
  })

  it('distinguishes the core aggregate from displayable muscle groups', () => {
    const coreGlobal = canonicalMuscleModelCatalog.muscles.find(({ id }) => id === 'core_global')
    expect(coreGlobal).toMatchObject({
      regionId: 'core',
      nameZh: '核心整体',
      nodeType: 'aggregate',
      bodyViews: ['front', 'back'],
    })
    expect(
      canonicalMuscleModelCatalog.muscles
        .filter(({ id }) => id !== 'core_global')
        .every(({ nodeType }) => nodeType === 'muscle_group'),
    ).toBe(true)
  })

  it('rejects aliases, case drift and unknown muscle identities', () => {
    expect(muscleIdSchema.safeParse('middle_chest').success).toBe(false)
    expect(muscleIdSchema.safeParse('Chest_Middle').success).toBe(false)
    expect(muscleIdSchema.safeParse('quadricep').success).toBe(false)
  })

  it('rejects duplicate views and an aggregate label on a muscle group', () => {
    expect(
      muscleDefinitionSchema.safeParse({
        id: 'chest_middle',
        regionId: 'chest',
        nameZh: '中胸',
        nodeType: 'muscle_group',
        bodyViews: ['front', 'front'],
        displayOrder: 2,
      }).success,
    ).toBe(false)
    expect(
      muscleDefinitionSchema.safeParse({
        id: 'chest_middle',
        regionId: 'back',
        nameZh: '中胸',
        nodeType: 'muscle_group',
        bodyViews: ['front'],
        displayOrder: 2,
      }).success,
    ).toBe(false)
    expect(
      muscleDefinitionSchema.safeParse({
        id: 'chest_middle',
        regionId: 'chest',
        nameZh: '中胸',
        nodeType: 'aggregate',
        bodyViews: ['front'],
        displayOrder: 2,
      }).success,
    ).toBe(false)
  })

  it('rejects same-version catalog drift and unknown fields', () => {
    expect(
      muscleModelCatalogSchema.safeParse({
        ...muscleModelCatalog,
        muscles: muscleModelCatalog.muscles.map((muscle) =>
          muscle.id === 'chest_middle' ? { ...muscle, nameZh: '胸大肌中部' } : muscle,
        ),
      }).success,
    ).toBe(false)
    expect(
      muscleModelCatalogSchema.safeParse({ ...muscleModelCatalog, source: 'unversioned' }).success,
    ).toBe(false)
  })
})
