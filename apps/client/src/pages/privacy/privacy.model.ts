import {
  accountDeletionConfirmationPhrase,
  type ConsentState,
  type PrivacyDataCategory,
  type PrivacyOverview,
} from '@myfitness/contracts'

export const privacyCategoryCopy: Record<
  PrivacyDataCategory,
  { label: string; shortLabel: string; note: string }
> = {
  profile: { label: '个人资料与目标', shortLabel: '资料', note: '建档、目标与风险确认' },
  health_records: { label: '身体与恢复记录', shortLabel: '身体', note: '包括修改与删除历史' },
  workouts: { label: '训练记录', shortLabel: '训练', note: '动作、组次与版本历史' },
  nutrition: { label: '饮食记录与收藏', shortLabel: '饮食', note: '餐次、份量与食物快照' },
  plans: { label: '每周计划', shortLabel: '计划', note: '计划内容与决策历史' },
  ai_outputs: { label: 'AI 解释', shortLabel: 'AI', note: '来源、模型与安全说明' },
  photo_analyses: { label: '餐食照片分析', shortLabel: '照片', note: '候选、选择与保留期媒体' },
  consent_receipts: { label: '授权凭据', shortLabel: '授权', note: '接受、撤回与版本时间' },
}

export const consentCopy: Record<ConsentState['purpose'], { label: string; note: string }> = {
  terms: { label: '服务条款', note: '维持账户所需；退出时随账户一并删除' },
  privacy: { label: '隐私规则', note: '维持账户所需；退出时随账户一并删除' },
  health_data: { label: '健康数据处理', note: '记录核心功能所需；可通过销户停止' },
  ai_plan_explanation: { label: 'AI 计划解释', note: '撤回后停止新的解释与待处理任务' },
  food_photo_analysis: { label: '餐食照片分析', note: '撤回后清除照片分析及仍保留的图片' },
}

export const consentStatusCopy: Record<ConsentState['status'], string> = {
  never_granted: '未授权',
  active: '有效',
  revoked: '已撤回',
}

export const formatInventoryCount = (count: number) => (count === 0 ? '无数据' : `${count} 项`)

export const formatReceiptToken = (token: string) =>
  token.length > 12 ? `${token.slice(0, 4)}…${token.slice(-6)}` : '已保存在本机'

export const deletionReady = (input: {
  phrase: string
  exportChoice: 'downloaded' | 'skip' | null
  understandsPermanent: boolean
}) =>
  input.phrase === accountDeletionConfirmationPhrase &&
  input.exportChoice !== null &&
  input.understandsPermanent

export const inventoryTotal = (overview: PrivacyOverview) =>
  overview.inventory.reduce((sum, item) => sum + item.recordCount, 0)
