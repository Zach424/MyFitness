import type {
  RecordSource,
  RecoveryEvidenceReference,
  RecoveryStateEstimate,
  RecoveryStateFactor,
  SubjectiveRecoveryMetric,
} from '@myfitness/contracts'
import {
  recoveryStateEstimateSchema,
  recoveryStatePolicyVersion,
  subjectiveRecoveryMetrics,
} from '@myfitness/contracts'

const dayMs = 86_400_000

const metricLabels: Record<SubjectiveRecoveryMetric, string> = {
  'recovery.energy': '精力',
  'recovery.sleep_quality': '睡眠质量',
  'recovery.stress': '压力',
  'recovery.soreness': '酸痛感',
}

const inverseMetrics = new Set<SubjectiveRecoveryMetric>(['recovery.stress', 'recovery.soreness'])

export type SubjectiveRecoveryObservation = {
  recordId: string
  revision: number
  metric: SubjectiveRecoveryMetric
  canonicalValue: number
  occurredAt: Date
  sourceKind: RecordSource['kind']
}

const localDay = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const normalizedScore = (metric: SubjectiveRecoveryMetric, value: number) =>
  Math.round(((inverseMetrics.has(metric) ? 5 - value : value - 1) / 4) * 100)

const mean = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) / values.length)

const evidenceReference = (
  observation: SubjectiveRecoveryObservation,
  window: RecoveryEvidenceReference['window'],
): RecoveryEvidenceReference => ({
  recordId: observation.recordId,
  revision: observation.revision,
  metric: observation.metric,
  occurredAt: observation.occurredAt.toISOString(),
  sourceKind: observation.sourceKind,
  window,
  canonicalValue: observation.canonicalValue,
  normalizedScore: normalizedScore(observation.metric, observation.canonicalValue),
})

const coverage = (
  evidence: RecoveryEvidenceReference[],
  startAt: Date,
  endAt: Date,
  days: 7 | 28,
  timezone: string,
) => ({
  startAt: startAt.toISOString(),
  endAt: endAt.toISOString(),
  days,
  observationCount: evidence.length,
  recordedDays: new Set(evidence.map((item) => localDay(new Date(item.occurredAt), timezone))).size,
  metricCount: new Set(evidence.map((item) => item.metric)).size,
})

const factorFor = (
  metric: SubjectiveRecoveryMetric,
  recent: RecoveryEvidenceReference[],
  baseline: RecoveryEvidenceReference[],
): RecoveryStateFactor => {
  const recentItems = recent.filter((item) => item.metric === metric)
  const baselineItems = baseline.filter((item) => item.metric === metric)
  const recentScore = mean(recentItems.map((item) => item.normalizedScore))
  const baselineScore = baselineItems.length
    ? mean(baselineItems.map((item) => item.normalizedScore))
    : null
  return {
    metric,
    label: metricLabels[metric],
    recentScore,
    baselineScore,
    changeFromBaseline: baselineScore === null ? null : recentScore - baselineScore,
    recentObservationCount: recentItems.length,
    baselineObservationCount: baselineItems.length,
  }
}

const stateLabel = (state: RecoveryStateEstimate['state']) => {
  if (state === 'unknown') return '主观恢复证据不足'
  if (state === 'current_only') return '只有近期主观恢复摘要'
  if (state === 'below_baseline') return '主观恢复低于个人基线'
  if (state === 'above_baseline') return '主观恢复高于个人基线'
  return '主观恢复接近个人基线'
}

export const estimateSubjectiveRecoveryState = (
  observations: SubjectiveRecoveryObservation[],
  timezone: string,
  at = new Date(),
): RecoveryStateEstimate => {
  const recentStart = new Date(at.getTime() - 7 * dayMs)
  const baselineStart = new Date(at.getTime() - 35 * dayMs)
  const metricSet = new Set<SubjectiveRecoveryMetric>(subjectiveRecoveryMetrics)
  const candidates = observations.filter(
    (item) => metricSet.has(item.metric) && item.occurredAt.getTime() >= baselineStart.getTime(),
  )
  const valid = candidates.filter(
    (item) =>
      item.occurredAt.getTime() <= at.getTime() &&
      item.sourceKind !== 'ai_estimate' &&
      Number.isInteger(item.canonicalValue) &&
      item.canonicalValue >= 1 &&
      item.canonicalValue <= 5,
  )

  const selectedByDay = new Map<string, SubjectiveRecoveryObservation>()
  for (const item of [...valid].sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.recordId.localeCompare(left.recordId),
  )) {
    const window = item.occurredAt.getTime() >= recentStart.getTime() ? 'recent' : 'baseline'
    const key = `${window}:${localDay(item.occurredAt, timezone)}:${item.metric}`
    if (!selectedByDay.has(key)) selectedByDay.set(key, item)
  }

  const selected = [...selectedByDay.values()].sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.recordId.localeCompare(left.recordId),
  )
  const recentEvidence = selected
    .filter((item) => item.occurredAt.getTime() >= recentStart.getTime())
    .map((item) => evidenceReference(item, 'recent'))
  const baselineEvidence = selected
    .filter((item) => item.occurredAt.getTime() < recentStart.getTime())
    .map((item) => evidenceReference(item, 'baseline'))
  const recentCoverage = coverage(recentEvidence, recentStart, at, 7, timezone)
  const baselineCoverage = coverage(baselineEvidence, baselineStart, recentStart, 28, timezone)
  const excludedObservationCount = candidates.length - selected.length
  const factors = subjectiveRecoveryMetrics
    .filter((metric) => recentEvidence.some((item) => item.metric === metric))
    .map((metric) => factorFor(metric, recentEvidence, baselineEvidence))
  const baseLimit = '只汇总已确认的主观精力、睡眠质量、压力与酸痛记录，不代表医学或生理恢复结论。'

  if (recentCoverage.recordedDays < 2 || recentCoverage.metricCount < 2) {
    return recoveryStateEstimateSchema.parse({
      policyVersion: recoveryStatePolicyVersion,
      state: 'unknown',
      score: null,
      baselineScore: null,
      changeFromBaseline: null,
      confidence: 'insufficient',
      consistency: 'unknown',
      label: stateLabel('unknown'),
      note: `近 7 天只有 ${recentCoverage.recordedDays} 个记录日、${recentCoverage.metricCount} 类主观恢复指标；至少需要 2 天和 2 类才形成摘要。`,
      coverage: { recent: recentCoverage, baseline: baselineCoverage, excludedObservationCount },
      factors,
      evidence: [...recentEvidence, ...baselineEvidence],
      limitations: [
        baseLimit,
        '证据不足时保持 Unknown，不用单次自述覆盖长期状态。',
        ...(excludedObservationCount
          ? [`另有 ${excludedObservationCount} 条重复、未来、无效或 AI 推断记录未进入估计。`]
          : []),
      ],
    })
  }

  const recentScores = factors.map((factor) => factor.recentScore)
  const consistency =
    Math.max(...recentScores) - Math.min(...recentScores) >= 50 ? 'mixed' : 'aligned'
  const matchedFactors = factors.filter((factor) => factor.baselineScore !== null)
  const hasBaseline = baselineCoverage.recordedDays >= 7 && matchedFactors.length >= 2
  const score = mean((hasBaseline ? matchedFactors : factors).map((factor) => factor.recentScore))
  const baselineScore = hasBaseline
    ? mean(matchedFactors.map((factor) => factor.baselineScore!))
    : null
  const changeFromBaseline = baselineScore === null ? null : score - baselineScore
  const state: RecoveryStateEstimate['state'] =
    changeFromBaseline === null
      ? 'current_only'
      : changeFromBaseline <= -15
        ? 'below_baseline'
        : changeFromBaseline >= 15
          ? 'above_baseline'
          : 'near_baseline'
  const confidence =
    hasBaseline &&
    recentCoverage.recordedDays >= 3 &&
    matchedFactors.length >= 3 &&
    consistency === 'aligned'
      ? 'moderate'
      : 'low'
  const comparison =
    changeFromBaseline === null
      ? '此前 28 天还没有足够个人基线，因此只显示近期摘要。'
      : `近期可比摘要 ${score}/100，个人基线 ${baselineScore}/100，变化 ${changeFromBaseline >= 0 ? '+' : ''}${changeFromBaseline}。`

  return recoveryStateEstimateSchema.parse({
    policyVersion: recoveryStatePolicyVersion,
    state,
    score,
    baselineScore,
    changeFromBaseline,
    confidence,
    consistency,
    label: consistency === 'mixed' ? '主观恢复信号不一致' : stateLabel(state),
    note: `${comparison}${consistency === 'mixed' ? ' 不同指标方向差异较大，不能归结为单一原因。' : ''}`,
    coverage: { recent: recentCoverage, baseline: baselineCoverage, excludedObservationCount },
    factors,
    evidence: [...recentEvidence, ...baselineEvidence],
    limitations: [
      baseLimit,
      hasBaseline
        ? '个人基线来自近期窗口之前的 28 天，会随新记录滚动变化。'
        : '缺少基线时不判断改善或恶化，也不允许该摘要提高计划强度。',
      ...(consistency === 'mixed'
        ? ['精力、睡眠质量、压力与酸痛可能反映不同因素；现有证据不能确定原因。']
        : []),
      ...(excludedObservationCount
        ? [`另有 ${excludedObservationCount} 条重复、未来、无效或 AI 推断记录未进入估计。`]
        : []),
    ],
  })
}

export const planningReadinessScore = (estimate: RecoveryStateEstimate) =>
  estimate.confidence === 'moderate' && estimate.consistency === 'aligned' ? estimate.score : null
