import type {
  HealthInsight,
  HealthInsightPoint,
  HealthRecord,
  MetricCode,
} from '@myfitness/contracts'

import { metricUiDefinitions, unitLabels } from './record.model'

export const healthInsightTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}

export const healthInsightChoices = (records: HealthRecord[]) => {
  const metrics = new Set<MetricCode>()
  for (const record of records) {
    if (record.status === 'confirmed') metrics.add(record.metric)
  }
  return Object.keys(metricUiDefinitions)
    .filter((metric): metric is MetricCode => metrics.has(metric as MetricCode))
    .map((metric) => ({ metric, label: metricUiDefinitions[metric].label }))
}

export const healthInsightPoints = (
  insight: HealthInsight,
  days: 7 | 30 | 90,
  limit = 18,
): HealthInsightPoint[] => {
  const boundary = new Date(insight.generatedAt).getTime() - days * 86_400_000
  return insight.series
    .filter((point) => new Date(point.occurredAt).getTime() >= boundary)
    .slice(0, limit)
    .reverse()
}

export const formatInsightValue = (value: number, unit: HealthInsightPoint['canonicalUnit']) =>
  `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${unitLabels[unit]}`

export const formatRecordedInsightValue = (
  point: Pick<HealthInsightPoint, 'displayValue' | 'displayUnit'>,
) =>
  `${Number(point.displayValue).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${unitLabels[point.displayUnit]}`

export const healthSourceLabels: Record<HealthInsightPoint['source']['kind'], string> = {
  manual: '手动记录',
  device: '设备记录',
  imported: '导入记录',
  ai_estimate: 'AI 估计',
}
