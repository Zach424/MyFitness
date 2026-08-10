import type { ReadFailureKind, SnapshotReadPhase } from './read-authority'

export {
  classifyReadFailure as classifyObservationReadFailure,
  snapshotReadPhase as observationReadPhase,
} from './read-authority'

export type ObservationReadFailureKind = ReadFailureKind

export type ObservationReadPhase = SnapshotReadPhase

export type ObservationReadSubject = 'health' | 'exercise' | 'nutrition'

const subjectLabels: Record<ObservationReadSubject, string> = {
  health: '身体与恢复观察',
  exercise: '动作观察',
  nutrition: '营养观察',
}

export const observationReadSubjectLabel = (subject: ObservationReadSubject) =>
  subjectLabels[subject]

export const observationReadFailureCopy = (
  kind: ObservationReadFailureKind,
  subject: ObservationReadSubject,
  hasSnapshot: boolean,
) => {
  const label = observationReadSubjectLabel(subject)
  if (kind === 'offline')
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? `${label}复核没有完成` : `${label}还没有读取`,
      detail: hasSnapshot
        ? '上次成功读取的观察仍在下方；重新核对前，它不会被当作当前服务结果。'
        : `当前无法确认${label}；页面不会用空白、零值或默认选择代替。`,
    }
  if (kind === 'refused')
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: `服务没有接受本次${label}核对`,
      detail: hasSnapshot
        ? '旧观察继续只读保留；重新核对成功前，不会改变服务端选择。'
        : '观察证据仍是未知状态；只有成功响应才能建立空白或有记录的结论。',
    }
  if (kind === 'service')
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: `${label}暂时无法读取`,
      detail: hasSnapshot
        ? '下方保留上次观察用于查看，本地时间窗仍可切换。'
        : '服务暂时没有返回观察证据；这里不会显示没有记录或零值。',
    }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: `无法确认当前${label}`,
    detail: hasSnapshot
      ? '旧观察继续只读保留；重新核对前不会把它描述为最新结果。'
      : `页面尚未取得可信${label}，也不会推断账户没有相关记录。`,
  }
}
