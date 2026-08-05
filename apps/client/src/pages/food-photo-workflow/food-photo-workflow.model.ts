import type { ConfirmFoodPhotoCandidate, FoodPhotoAnalysis } from '@myfitness/contracts'

export type FoodPhotoReviewDraft = {
  selected: string[]
  grams: Record<string, string>
}

type ReviewableAnalysis = Pick<FoodPhotoAnalysis, 'status' | 'content'>

export const reviewDraftFromAnalysis = (analysis: ReviewableAnalysis): FoodPhotoReviewDraft => {
  const candidates = analysis.status === 'ready' ? (analysis.content?.candidates ?? []) : []
  return {
    selected: candidates.map((candidate) => candidate.catalogKey),
    grams: Object.fromEntries(
      candidates.map((candidate) => [
        candidate.catalogKey,
        String(Math.round((candidate.portionRange.minGrams + candidate.portionRange.maxGrams) / 2)),
      ]),
    ),
  }
}

export const buildFoodPhotoConfirmation = (
  analysis: ReviewableAnalysis,
  draft: FoodPhotoReviewDraft,
): ConfirmFoodPhotoCandidate => {
  if (analysis.status !== 'ready' || !analysis.content) {
    throw new Error('这份校样已不可确认，请删除结果后重新选择照片。')
  }
  if (!draft.selected.length) {
    throw new Error('请至少选择一个候选，或删除校样后返回手动添加食物。')
  }

  const candidates = new Map(
    analysis.content.candidates.map((candidate) => [candidate.catalogKey, candidate]),
  )
  const uniqueKeys = new Set(draft.selected)
  if (uniqueKeys.size !== draft.selected.length) {
    throw new Error('候选选择重复，请重新核对校样。')
  }

  const items = draft.selected.map((catalogKey) => {
    const candidate = candidates.get(catalogKey)
    const grams = Number(draft.grams[catalogKey])
    if (
      !candidate ||
      !Number.isInteger(grams) ||
      grams < candidate.portionRange.minGrams ||
      grams > candidate.portionRange.maxGrams
    ) {
      throw new Error('确认克重需要位于每个候选显示的区间内。')
    }
    return { catalogKey, grams }
  })

  return { items }
}
