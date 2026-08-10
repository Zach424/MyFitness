import type { ReadFailureKind, SnapshotReadPhase } from './read-authority'

export {
  classifyReadFailure as classifyRegisterReadFailure,
  snapshotReadPhase as registerReadPhase,
} from './read-authority'

export type RegisterReadFailureKind = ReadFailureKind

export type RegisterReadPhase = SnapshotReadPhase

export const registerReadFailureCopy = (
  kind: RegisterReadFailureKind,
  subject: 'food' | 'action',
  hasSnapshot: boolean,
) => {
  const noun = subject === 'food' ? '食物定义' : '动作定义'
  if (kind === 'offline')
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? `${noun}目录复核没有完成` : `${noun}目录还没有读取`,
      detail: hasSnapshot
        ? '上次成功读取的目录仍在下方；重新核对前不能新建、纠正、查看历史或归档。'
        : `当前无法确认账户里的${noun}；页面不会用空目录代替，也不会提交定义操作。`,
    }
  if (kind === 'refused')
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: `服务没有接受本次${noun}核对`,
      detail: hasSnapshot
        ? '旧目录继续只读保留；重新核对成功前不能用它授权定义操作。'
        : '目录数量仍是未知状态；重新核对成功前，定义操作保持冻结。',
    }
  if (kind === 'service')
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: `${noun}目录暂时无法读取`,
      detail: hasSnapshot
        ? '下方保留上次目录用于查看，所有定义操作保持冻结。'
        : '服务暂时没有返回目录证据；这里不会显示“还没有定义”。',
    }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: `无法确认当前${noun}目录`,
    detail: hasSnapshot
      ? '旧目录继续只读保留；重新核对前不会提交任何定义操作。'
      : `页面尚未取得可信目录，也不会推断账户没有${noun}。`,
  }
}
