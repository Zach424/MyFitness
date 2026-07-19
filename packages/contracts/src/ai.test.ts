import { describe, expect, it } from 'vitest'

import {
  aiExplanationContentSchema,
  aiExplanationSchema,
  aiPlanConsentVersion,
  aiPlanPromptVersion,
  aiPlanPromptVersions,
  aiPlanValidatorVersion,
  aiPlanValidatorVersions,
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
  it('keeps each current provenance version inside its readable history', () => {
    expect(aiPlanPromptVersions).toContain(aiPlanPromptVersion)
    expect(aiPlanValidatorVersions).toContain(aiPlanValidatorVersion)
  })

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

  it('reads historical validator provenance without using it for new worker calls', () => {
    expect(
      aiExplanationSchema.parse({
        id: '11111111-1111-4111-8111-111111111111',
        planId: '22222222-2222-4222-8222-222222222222',
        planRevision: 2,
        source: 'fixture',
        provider: 'fixture',
        model: 'fixture-plan-explainer-v1',
        promptVersion: 'plan-explanation-v1',
        validatorVersion: 'plan-explanation-safety-v1',
        failureCode: null,
        content,
        safetyNote: '这是对既有计划的辅助解释，不是医疗诊断或处方；计划内容没有被 AI 自动修改。',
        createdAt: '2026-07-19T08:00:00.000Z',
      }).validatorVersion,
    ).toBe('plan-explanation-safety-v1')
  })
})
