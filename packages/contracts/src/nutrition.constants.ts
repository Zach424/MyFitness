export const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export const foodCategories = [
  'staple',
  'protein',
  'vegetable',
  'fruit',
  'dairy',
  'snack',
  'custom',
] as const
export const foodPortionUnits = ['g', 'ml', 'piece', 'serving'] as const
export const nutritionSourceKinds = ['manual', 'imported'] as const
export const mealRevisionActions = ['created', 'updated', 'deleted'] as const

export const starterFoodCatalog = [
  {
    foodKey: 'chicken_breast_cooked',
    name: '熟鸡胸肉',
    category: 'protein',
    defaultServing: { amount: 120, unit: 'g', grams: 120 },
    nutrientsPer100g: {
      energyKcal: 165,
      proteinG: 31,
      carbohydrateG: 0,
      fatG: 3.6,
      fiberG: 0,
    },
  },
  {
    foodKey: 'rice_cooked',
    name: '熟米饭',
    category: 'staple',
    defaultServing: { amount: 150, unit: 'g', grams: 150 },
    nutrientsPer100g: {
      energyKcal: 130,
      proteinG: 2.7,
      carbohydrateG: 28,
      fatG: 0.3,
      fiberG: 0.4,
    },
  },
  {
    foodKey: 'egg_boiled',
    name: '水煮蛋',
    category: 'protein',
    defaultServing: { amount: 1, unit: 'piece', grams: 50 },
    nutrientsPer100g: {
      energyKcal: 155,
      proteinG: 12.6,
      carbohydrateG: 1.1,
      fatG: 10.6,
      fiberG: 0,
    },
  },
  {
    foodKey: 'oats_dry',
    name: '燕麦片',
    category: 'staple',
    defaultServing: { amount: 40, unit: 'g', grams: 40 },
    nutrientsPer100g: {
      energyKcal: 379,
      proteinG: 13.2,
      carbohydrateG: 67.7,
      fatG: 6.5,
      fiberG: 10.1,
    },
  },
  {
    foodKey: 'whole_milk',
    name: '全脂牛奶',
    category: 'dairy',
    defaultServing: { amount: 250, unit: 'ml', grams: 258 },
    nutrientsPer100g: {
      energyKcal: 61,
      proteinG: 3.2,
      carbohydrateG: 4.8,
      fatG: 3.3,
      fiberG: 0,
    },
  },
  {
    foodKey: 'tofu_firm',
    name: '北豆腐',
    category: 'protein',
    defaultServing: { amount: 150, unit: 'g', grams: 150 },
    nutrientsPer100g: {
      energyKcal: 144,
      proteinG: 17.3,
      carbohydrateG: 2.8,
      fatG: 8.7,
      fiberG: 2.3,
    },
  },
  {
    foodKey: 'broccoli_cooked',
    name: '熟西兰花',
    category: 'vegetable',
    defaultServing: { amount: 150, unit: 'g', grams: 150 },
    nutrientsPer100g: {
      energyKcal: 35,
      proteinG: 2.4,
      carbohydrateG: 7.2,
      fatG: 0.4,
      fiberG: 3.3,
    },
  },
  {
    foodKey: 'banana',
    name: '香蕉',
    category: 'fruit',
    defaultServing: { amount: 1, unit: 'piece', grams: 118 },
    nutrientsPer100g: {
      energyKcal: 89,
      proteinG: 1.1,
      carbohydrateG: 22.8,
      fatG: 0.3,
      fiberG: 2.6,
    },
  },
  {
    foodKey: 'salmon_cooked',
    name: '熟三文鱼',
    category: 'protein',
    defaultServing: { amount: 120, unit: 'g', grams: 120 },
    nutrientsPer100g: {
      energyKcal: 206,
      proteinG: 22.1,
      carbohydrateG: 0,
      fatG: 12.4,
      fiberG: 0,
    },
  },
  {
    foodKey: 'sweet_potato_cooked',
    name: '熟红薯',
    category: 'staple',
    defaultServing: { amount: 180, unit: 'g', grams: 180 },
    nutrientsPer100g: {
      energyKcal: 90,
      proteinG: 2,
      carbohydrateG: 20.7,
      fatG: 0.2,
      fiberG: 3.3,
    },
  },
] as const
