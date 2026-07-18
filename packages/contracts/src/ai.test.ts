import { describe, expect, it } from 'vitest'

import {
  aiExplanationContentSchema,
  aiPlanConsentVersion,
  aiWorkerResponseSchema,
  generateAiExplanationSchema,
} from './ai'

const content = {
  headline: '先观察这一周',
  overview: '只解释既有计划，不改变训练内容。',
  highlights: [
    {
      title: '时间有依据',
      detail: '安排来自已确认的可用日。',
      evidenceKeys: ['plan_schedule'] as const,
    },
    {
      title: '恢复保持保守',
      detail: '恢复资料不足时不会补造分数。',
      evidenceKeys: ['plan_recovery'] as const,
    },
  ],
  nextStep: '检查本周时间，再决定是否采用。',
}

describe('AI explanation contracts', () => {
  it('requires explicit current-version consent', () => {
    expect(
      generateAiExplanationSchema.parse({
        expectedPlanRevision: 2,
        consent: {
          purpose: 'ai_plan_explanation',
          version: aiPlanConsentVersion,
          accepted: true,
        },
      }),
    ).toBeTruthy()
    expect(
      generateAiExplanationSchema.safeParse({
        expectedPlanRevision: 2,
        consent: {
          purpose: 'ai_plan_explanation',
          version: aiPlanConsentVersion,
          accepted: false,
        },
      }).success,
    ).toBe(false)
  })

  it('keeps worker success and failure states mutually exclusive', () => {
    expect(aiExplanationContentSchema.parse(content)).toEqual(content)
    expect(
      aiWorkerResponseSchema.safeParse({
        status: 'generated',
        provider: 'fixture',
        model: 'fixture-v1',
        content,
        failureCode: null,
        providerResponseId: null,
        usage: null,
        latencyMs: 3,
      }).success,
    ).toBe(true)
    expect(
      aiWorkerResponseSchema.safeParse({
        status: 'failed',
        provider: 'openai',
        model: 'gpt-5.6-terra',
        content,
        failureCode: 'provider_timeout',
        providerResponseId: null,
        usage: null,
        latencyMs: 20_000,
      }).success,
    ).toBe(false)
  })
})
