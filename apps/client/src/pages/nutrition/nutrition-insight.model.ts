import type {
  NutritionInsight,
  NutritionInsightDay,
  NutritionInsightWindow,
} from '@myfitness/contracts'

export type NutritionInsightMetric = 'energyKcal' | 'proteinG' | 'carbohydrateG' | 'fatG' | 'fiberG'

export const nutritionInsightMetricLabels: Record<NutritionInsightMetric, string> = {
  energyKcal: '能量 kcal',
  proteinG: '蛋白质 g',
  carbohydrateG: '碳水 g',
  fatG: '脂肪 g',
  fiberG: '纤维 g',
}

export const nutritionInsightTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export const nutritionInsightDays = (insight: NutritionInsight, days: 7 | 30 | 90) =>
  insight.series.slice(-days)

export const nutritionInsightValue = (day: NutritionInsightDay, metric: NutritionInsightMetric) =>
  day.nutrients[metric]

export const recordedDayAverage = (
  window: NutritionInsightWindow,
  metric: NutritionInsightMetric,
) => {
  const total = window.nutrients[metric]
  return total === null || window.recordedDays === 0 ? null : total / window.recordedDays
}

export const nutritionEvidenceLevel = (
  day: NutritionInsightDay,
  metric: NutritionInsightMetric,
  maximum: number,
) => {
  if (!day.hasEvidence) return 'missing' as const
  const value = nutritionInsightValue(day, metric)
  if (value === null) return 'unknown' as const
  if (maximum <= 0) return 1 as const
  return Math.min(4, Math.max(1, Math.ceil((value / maximum) * 4))) as 1 | 2 | 3 | 4
}
