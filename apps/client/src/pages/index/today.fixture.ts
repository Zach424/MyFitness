export type RailItemStatus = 'confirmed' | 'estimated' | 'planned'

export interface RailItem {
  id: string
  time: string
  category: string
  title: string
  value?: string
  note: string
  status: RailItemStatus
  action?: string
}

export interface TodayFixture {
  dateLabel: string
  greeting: string
  focus: string
  readiness: {
    label: string
    score: number
    note: string
  }
  completion: {
    completed: number
    total: number
  }
  rail: RailItem[]
  rationale: {
    title: string
    body: string
    evidence: Array<{ label: string; value: string }>
  }
}

export const todayFixture: TodayFixture = {
  dateLabel: '7月18日 · 周六',
  greeting: '晚上好，志庆',
  focus: '今天，稳稳推进',
  readiness: {
    label: '恢复尚可',
    score: 74,
    note: '睡眠略少，但近两天疲劳平稳。按计划训练，不额外加量。',
  },
  completion: {
    completed: 2,
    total: 4,
  },
  rail: [
    {
      id: 'weight',
      time: '07:40',
      category: '身体',
      title: '晨间体重',
      value: '72.4 kg',
      note: '7 日均值较上周 -0.3 kg',
      status: 'confirmed',
    },
    {
      id: 'lunch',
      time: '12:30',
      category: '饮食',
      title: '午餐照片',
      value: '约 620 kcal',
      note: '这是估计值，确认份量后再计入',
      status: 'estimated',
      action: '确认午餐',
    },
    {
      id: 'training',
      time: '18:30',
      category: '训练',
      title: '下肢 A',
      value: '45 min',
      note: '深蹲 · 罗马尼亚硬拉 · 分腿蹲',
      status: 'planned',
      action: '开始训练',
    },
    {
      id: 'sleep',
      time: '23:00',
      category: '恢复',
      title: '睡眠目标',
      value: '7 h 30 m',
      note: '睡前 30 分钟减少强光和咖啡因',
      status: 'planned',
    },
  ],
  rationale: {
    title: '本周不加量',
    body: '近两次训练完成度稳定，但昨晚睡眠比目标少 48 分钟。保留原训练量，比追求临时突破更合适。',
    evidence: [
      { label: '训练完成度', value: '92%' },
      { label: '主观疲劳', value: '2 / 5' },
      { label: '睡眠差值', value: '-48 min' },
    ],
  },
}
