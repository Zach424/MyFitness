export const aiExplanationHistoryPageSize = 5

export type AiExplanationLedgerState = 'current' | 'frozen' | 'history'

export const aiExplanationLedgerState = (
  explanationPlanRevision: number,
  currentPlanRevision: number,
  canExplainCurrentPlan: boolean,
): AiExplanationLedgerState => {
  if (explanationPlanRevision !== currentPlanRevision) return 'history'
  return canExplainCurrentPlan ? 'current' : 'frozen'
}

export const nextAiExplanationHistoryCount = (current: number, total: number) =>
  Math.min(total, current + aiExplanationHistoryPageSize)
