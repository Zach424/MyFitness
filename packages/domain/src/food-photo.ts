import {
  foodPhotoCandidateContentSchema,
  starterFoodCatalog,
  type ConfirmFoodPhotoCandidate,
  type FoodPhotoCandidateContent,
} from '@myfitness/contracts'

const catalogByKey = new Map<string, (typeof starterFoodCatalog)[number]>(
  starterFoodCatalog.map((food) => [food.foodKey, food]),
)

export type FoodPhotoValidation =
  { valid: true; content: FoodPhotoCandidateContent } | { valid: false; reason: string }

export const validateFoodPhotoCandidates = (value: unknown): FoodPhotoValidation => {
  const parsed = foodPhotoCandidateContentSchema.safeParse(value)
  if (!parsed.success) return { valid: false, reason: 'schema_invalid' }
  const content = parsed.data

  if (content.safetyStatus === 'rejected') {
    return content.candidates.length === 0 && content.needsManualEntry
      ? { valid: true, content }
      : { valid: false, reason: 'rejected_content_must_not_contain_candidates' }
  }
  if (content.candidates.length === 0 && !content.needsManualEntry) {
    return { valid: false, reason: 'empty_content_requires_manual_entry' }
  }

  const seen = new Set<string>()
  for (const candidate of content.candidates) {
    if (seen.has(candidate.catalogKey)) return { valid: false, reason: 'duplicate_catalog_key' }
    seen.add(candidate.catalogKey)
    const food = catalogByKey.get(candidate.catalogKey)
    if (!food || food.name !== candidate.label) {
      return { valid: false, reason: 'candidate_not_in_versioned_catalog' }
    }
    const baseline = food.defaultServing.grams
    if (
      candidate.portionRange.minGrams < Math.max(5, Math.round(baseline * 0.15)) ||
      candidate.portionRange.maxGrams > Math.round(baseline * 4)
    ) {
      return { valid: false, reason: 'portion_range_outside_catalog_bounds' }
    }
  }
  return { valid: true, content }
}

export const validateFoodPhotoConfirmation = (
  content: FoodPhotoCandidateContent,
  input: ConfirmFoodPhotoCandidate,
) => {
  if (content.safetyStatus !== 'safe') return false
  const candidates = new Map(
    content.candidates.map((candidate) => [candidate.catalogKey, candidate]),
  )
  return input.items.every((item) => {
    const candidate = candidates.get(item.catalogKey)
    return Boolean(
      candidate &&
      item.grams >= candidate.portionRange.minGrams &&
      item.grams <= candidate.portionRange.maxGrams,
    )
  })
}
