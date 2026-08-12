export type MeHubCapability =
  | '个人资料'
  | '训练目标'
  | '单位与时区'
  | '安全边界'
  | '本人训练安排'
  | '已记录训练观察'
  | '证据范围与限制'
  | '授权记录'
  | '数据导出'
  | '账户删除'

export type MeHubSection = {
  id: 'profile' | 'mirror' | 'custody'
  eyebrow: string
  title: string
  description: string
  actionLabel: string
  path: '/pages/onboarding/index' | '/pages/personal-model/index' | '/pages/privacy/index'
  capabilities: readonly MeHubCapability[]
  boundary: string
}

export const meHubSections: readonly MeHubSection[] = [
  {
    id: 'profile',
    eyebrow: '01 / 我提供的依据',
    title: '资料与目标',
    description: '管理计划会使用的个人资料、训练目标、可用节奏、单位和时区。',
    actionLabel: '打开资料底稿',
    path: '/pages/onboarding/index',
    capabilities: ['个人资料', '训练目标', '单位与时区', '安全边界'],
    boundary: '进入后才读取当前资料修订；本入口不显示推测的完成状态。',
  },
  {
    id: 'mirror',
    eyebrow: '02 / 系统整理的观察',
    title: '系统如何理解我',
    description: '逐项核对本人训练安排，以及系统从已确认记录整理出的频次和时长观察。',
    actionLabel: '打开个人认知镜子',
    path: '/pages/personal-model/index',
    capabilities: ['本人训练安排', '已记录训练观察', '证据范围与限制'],
    boundary: '进入后一次只读取一个主题；不会组合评分，也不会自动调整计划。',
  },
  {
    id: 'custody',
    eyebrow: '03 / 我控制的保管',
    title: '数据与授权',
    description: '查看服务当前保存的数据、可选授权、导出范围与账户删除边界。',
    actionLabel: '打开数据保管台账',
    path: '/pages/privacy/index',
    capabilities: ['授权记录', '数据导出', '账户删除'],
    boundary: '敏感操作只在取得当前保管清单后开放；入口本身不执行任何变更。',
  },
] as const

export const meHubCapabilities = meHubSections.flatMap((section) => section.capabilities)
