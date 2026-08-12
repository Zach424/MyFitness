import { describe, expect, it } from 'vitest'

import {
  bodyMetricCodes,
  bodyMetricDefinitions,
  bodyMetricRegistry,
  bodyMetricRegistrySchema,
  bodyMetricSourceCapabilities,
  bodyMetricUnitConversionDefinitions,
  bodyMetricUnitCodes,
  currentBodyMetricDefinitions,
  plannedBodyMetricDefinitions,
} from './body-metric-registry'
import {
  measurementPersistenceDecimalPlaces,
  metricCodes,
  metricUnitDefinitions,
} from './health-record.constants'

describe('body metric registry v2', () => {
  it('publishes the canonical strict registry with unique identities', () => {
    expect(bodyMetricRegistrySchema.parse(bodyMetricRegistry)).toEqual(bodyMetricRegistry)
    expect(new Set(bodyMetricCodes).size).toBe(bodyMetricCodes.length)
    expect(bodyMetricDefinitions).toHaveLength(29)
    expect(currentBodyMetricDefinitions).toHaveLength(9)
    expect(plannedBodyMetricDefinitions).toHaveLength(20)
  })

  it('preserves every existing health-record metric and its unit contract in order', () => {
    expect(currentBodyMetricDefinitions.map((definition) => definition.code)).toEqual(metricCodes)
    for (const definition of currentBodyMetricDefinitions) {
      const currentUnits = metricUnitDefinitions[definition.code]
      expect(definition.canonicalUnit).toBe(currentUnits.canonicalUnit)
      expect(definition.allowedDisplayUnits).toEqual(currentUnits.allowedUnits)
      expect(definition.persistenceDecimalPlaces).toBe(measurementPersistenceDecimalPlaces)
      expect(definition.status).toBe('current')
    }
  })

  it('keeps units convertible and derivations explicit', () => {
    for (const definition of bodyMetricDefinitions) {
      for (const unit of definition.allowedDisplayUnits) {
        expect(bodyMetricUnitConversionDefinitions[unit].canonicalUnit).toBe(
          definition.canonicalUnit,
        )
      }
      expect(definition.technicalBounds.interpretation).toBe('ingestion_guard_not_clinical_range')
      expect(definition.technicalBounds.minimum).toBeLessThan(definition.technicalBounds.maximum)
      expect(new Set(definition.sourceCapabilities).size).toBe(definition.sourceCapabilities.length)
      expect(definition.sourceCapabilities.includes('deterministic_derived')).toBe(
        definition.derivation.kind === 'deterministic',
      )
    }
    expect(Object.keys(bodyMetricUnitConversionDefinitions)).toEqual(bodyMetricUnitCodes)
    expect(bodyMetricSourceCapabilities).toContain('ai_estimated_candidate')
    expect(bodyMetricSourceCapabilities).toContain('ai_extracted_candidate')
  })

  it('fails closed on reordered, altered or medically relabelled definitions', () => {
    expect(
      bodyMetricRegistrySchema.safeParse({
        ...bodyMetricRegistry,
        persistenceDecimalPlaces: 3,
      }).success,
    ).toBe(false)

    const reordered = {
      ...bodyMetricRegistry,
      metrics: [...bodyMetricRegistry.metrics].reverse(),
    }
    expect(bodyMetricRegistrySchema.safeParse(reordered).success).toBe(false)

    const altered = {
      ...bodyMetricRegistry,
      metrics: bodyMetricRegistry.metrics.map((metric) =>
        metric.code === 'body.bmi'
          ? {
              ...metric,
              technicalBounds: {
                ...metric.technicalBounds,
                interpretation: 'clinical_normal_range',
              },
            }
          : metric,
      ),
    }
    expect(bodyMetricRegistrySchema.safeParse(altered).success).toBe(false)
  })
})
