export const aiExplanationProviders = ['fixture', 'openai', 'unavailable'] as const
export const aiWorkerProviders = ['fixture', 'openai'] as const
export const aiExplanationSources = ['model', 'fixture', 'fallback'] as const
export const aiExplanationEvidenceKeys = [
  'plan_schedule',
  'plan_experience',
  'plan_recovery',
  'recent_activity',
  'recent_workouts',
  'recent_meals',
  'nutrition_focus',
] as const
export const aiWorkerFailureCodes = [
  'provider_unavailable',
  'provider_timeout',
  'provider_refusal',
  'provider_error',
  'invalid_output',
  'safety_validation_failed',
] as const

export const aiPlanPromptVersion = 'plan-explanation-v1' as const
export const aiPlanValidatorVersion = 'plan-explanation-safety-v1' as const
export const aiPlanConsentVersion = 'ai-plan-explanation-2026-07-19.v1' as const
export const aiPlanSafetyNote =
  '这是对既有计划的辅助解释，不是医疗诊断或处方；计划内容没有被 AI 自动修改。' as const
