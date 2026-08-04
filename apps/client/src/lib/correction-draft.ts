export type CorrectionDraftTarget = {
  aggregateId: string
  baseRevision: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const correctionDraftTarget = (aggregate: { id: string; revision: number }) => ({
  aggregateId: aggregate.id,
  baseRevision: aggregate.revision,
})

export const isCorrectionDraftTarget = (value: unknown): value is CorrectionDraftTarget => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    Object.keys(candidate).every((key) => key === 'aggregateId' || key === 'baseRevision') &&
    typeof candidate.aggregateId === 'string' &&
    uuidPattern.test(candidate.aggregateId) &&
    Number.isInteger(candidate.baseRevision) &&
    (candidate.baseRevision as number) > 0
  )
}

export const currentCorrectionTarget = <T extends { id: string; revision: number }>(
  items: T[],
  target: CorrectionDraftTarget,
) => {
  const aggregate = items.find((item) => item.id === target.aggregateId)
  return aggregate?.revision === target.baseRevision ? aggregate : null
}
