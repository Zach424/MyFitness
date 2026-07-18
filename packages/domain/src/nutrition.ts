import type { MealItemInput, NutrientsPer100g } from '@myfitness/contracts'

const round = (value: number, precision = 2) => {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export const calculateServingNutrition = (nutrients: NutrientsPer100g, grams: number) => {
  const factor = grams / 100
  return {
    energyKcal: round(nutrients.energyKcal * factor),
    proteinG: round(nutrients.proteinG * factor),
    carbohydrateG: round(nutrients.carbohydrateG * factor),
    fatG: round(nutrients.fatG * factor),
    fiberG: round((nutrients.fiberG ?? 0) * factor),
  }
}

export const calculateMeal = (items: MealItemInput[]) => {
  const summary = {
    energyKcal: 0,
    proteinG: 0,
    carbohydrateG: 0,
    fatG: 0,
    fiberG: 0,
  }
  const normalizedItems = items.map((item) => {
    const itemSummary = calculateServingNutrition(item.food.nutrientsPer100g, item.serving.grams)
    for (const key of Object.keys(summary) as Array<keyof typeof summary>) {
      summary[key] += itemSummary[key]
    }
    return { ...item, summary: itemSummary }
  })

  for (const key of Object.keys(summary) as Array<keyof typeof summary>) {
    summary[key] = round(summary[key])
  }
  return { items: normalizedItems, summary }
}
