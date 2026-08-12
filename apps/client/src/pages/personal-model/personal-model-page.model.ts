import type { PersonalModelFeedbackChoice, PersonalModelSubjectKey } from '@myfitness/contracts'

import type { PersonalModelFeedbackWriteFailureKind } from '../../lib/personal-model-feedback-write'
import type { ReadFailureKind } from '../../lib/read-authority'

export type PersonalModelPageSubjectOption = {
  subjectKey: PersonalModelSubjectKey
  label: string
  loadingTitle: string
}

export const personalModelPageSubjects: readonly PersonalModelPageSubjectOption[] = [
  {
    subjectKey: 'training.availability',
    label: '本人安排',
    loadingTitle: '正在核对训练时间安排',
  },
  {
    subjectKey: 'training.recorded_frequency',
    label: '记录频次',
    loadingTitle: '正在核对已记录训练频次',
  },
  {
    subjectKey: 'training.recorded_session_duration',
    label: '记录时长',
    loadingTitle: '正在核对已记录课次时长',
  },
] as const

export const defaultPersonalModelPageSubject = 'training.recorded_frequency' as const

export const personalModelPageSubjectOption = (subjectKey: PersonalModelSubjectKey) =>
  personalModelPageSubjects.find((option) => option.subjectKey === subjectKey)!

export const personalModelPageSubjectContext = (subjectKey: PersonalModelSubjectKey): string => {
  if (subjectKey === 'training.availability') {
    return '本人提交 · 可训练星期与单次时长，不代表实际完成。'
  }
  if (subjectKey === 'training.recorded_frequency') {
    return '已确认记录 · 完整观察周内的课次，不判断现实训练是否达标。'
  }
  return '已确认记录 · 课次时长分布，不评价效果、能力或强度。'
}

export type PersonalModelPageFeedbackOption = {
  choice: Exclude<PersonalModelFeedbackChoice, 'temporary_context'>
  label: string
  detail: string
}

export const personalModelPageFeedbackOptions: readonly PersonalModelPageFeedbackOption[] = [
  { choice: 'matches_me', label: '符合我', detail: '保留为你已确认的当前认识。' },
  { choice: 'disagree', label: '不同意', detail: '标记为有异议，不再用于后续建议。' },
  { choice: 'uncertain', label: '暂不确定', detail: '保留待核对，不代表你已经认可。' },
] as const

export type PersonalModelPageFeedbackFailurePresentation = {
  eyebrow: string
  title: string
  detail: string
  retryable: boolean
}

export const personalModelPageFeedbackFailureCopy = (
  kind: PersonalModelFeedbackWriteFailureKind,
): PersonalModelPageFeedbackFailurePresentation => {
  if (kind === 'conflict') {
    return {
      eyebrow: 'VIEW CHANGED / 认识已变化',
      title: '这次反馈没有写入旧修订',
      detail: '当前认识在提交前已经变化。先重新读取，再核对新的内容。',
      retryable: false,
    }
  }
  if (kind === 'offline' || kind === 'unknown') {
    return {
      eyebrow: 'RESULT UNKNOWN / 结果待确认',
      title: '还不能确认这次反馈是否送达',
      detail: '页面不会自动重放。你可以明确重试同一次反馈，服务会返回首次收据。',
      retryable: true,
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: '这次反馈暂未完成',
      detail: '反馈内容仍留在当前页面；服务恢复后可明确重试同一次反馈。',
      retryable: true,
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'WRITE REFUSED / 写入被拒绝',
      title: '服务没有接受这次反馈',
      detail: '请先重新登录或重新读取当前认识，再决定是否提交。',
      retryable: false,
    }
  }
  return {
    eyebrow: 'RECEIPT INVALID / 收据无效',
    title: '无法安全确认这次反馈',
    detail: '返回内容与本次认识不匹配；页面不会据此改变核对状态。',
    retryable: false,
  }
}

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
      title: hasSnapshot ? '更新没有完成，上次认知仍在' : '还没有读取到这项认知',
      detail: hasSnapshot
        ? '设备暂时无法连接服务。下面继续显示上次成功读取的认知，并明确标记为旧快照。'
        : '设备暂时无法连接服务。页面不会用默认安排或零值填补未知状态。',
    }
  }
  if (kind === 'refused') {
    return {
      eyebrow: 'READ REFUSED / 读取被拒绝',
      title: hasSnapshot ? '服务拒绝了本次更新' : '服务没有接受本次读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的观察；请稍后手动重试，不会自动轮询。'
        : '当前认知仍是未知状态；请确认登录状态后手动重试。',
    }
  }
  if (kind === 'service') {
    return {
      eyebrow: 'SERVICE PAUSED / 服务暂不可用',
      title: hasSnapshot ? '本次更新暂未完成' : '当前认知暂时无法读取',
      detail: hasSnapshot
        ? '下面保留上次成功读取的观察；服务恢复后可手动重试。'
        : '服务暂时没有返回认知；页面不会把这次失败解释成没有资料或记录。',
    }
  }
  return {
    eyebrow: 'READ UNKNOWN / 结果未知',
    title: hasSnapshot ? '无法确认本次更新结果' : '无法确认当前认知状态',
    detail: hasSnapshot
      ? '下面保留上次成功读取的观察；需要手动重试后才能确认更新。'
      : '页面尚未取得可信快照，也不会显示推测的安排、频次或时长。',
  }
}
