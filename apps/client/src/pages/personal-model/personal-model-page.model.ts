import type { ReadFailureKind } from '../../lib/read-authority'

export const personalModelPageSubject = 'training.recorded_frequency' as const

export type PersonalModelPageFailurePresentation = {
  eyebrow: string
  title: string
  detail: string
}

export const personalModelPageFailureCopy = (
  kind: ReadFailureKind,
  hasSnapshot: boolean,
): PersonalModelPageFailurePresentation => {
  if (kind === 'offline') {
    return {
      eyebrow: 'OFFLINE / 连接未完成',
      title: hasSnapshot ? '更新没有完成，上次观察仍在' : '还没有读取到训练观察',
      detail: hasSnapshot
        ? '设备暂时无法连接服务。下面继续显示上次成功读取的观察，并明确标记为旧快照。'
        : '设备暂时无法连接服务。页面不会把未知状态显示成零次训练。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次更新' : '服务没有接受本次读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的观察；请稍后手动重试，不会自动轮询。'
        : '训练观察仍是未知状态；请确认登录状态后手动重试。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次更新暂未完成' : '训练观察暂时无法读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的观察；服务恢复后可手动重试。'
        : '服务暂时没有返回观察；页面不会把这次失败解释成没有训练记录。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认本次更新结果' : '无法确认训练观察状态',
    detail: hasSnapshot
      ? '下面保留上次成功读取的观察；需要手动重试后才能确认更新。'
      : '页面尚未取得可信快照，也不会显示推测的训练频次。',
  }
}
