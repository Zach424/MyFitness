import type { PlanExperienceChoice } from '@myfitness/contracts'

export const planExperienceChoices: Array<[PlanExperienceChoice, string]> = [
  ['easier_than_expected', '比预期轻松'],
  ['about_right', '安排合适'],
  ['not_right_for_me', '不适合我'],
  ['not_sure_yet', '还不能判断'],
]

export const planExperienceLabel = (value: PlanExperienceChoice) =>
  planExperienceChoices.find(([choice]) => choice === value)![1]
