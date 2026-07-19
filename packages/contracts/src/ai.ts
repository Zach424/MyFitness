import * as z from 'zod'

import { planEvidenceSchema, planIntensitySchema, planSessionKindSchema } from './plan'
import {
  aiExplanationEvidenceKeys,
  aiExplanationProviders,
  aiExplanationSources,
  aiPlanConsentVersion,
  aiPlanPromptVersion,
  aiPlanPromptVersions,
  aiPlanSafetyNote,
  aiPlanValidatorVersion,
  aiPlanValidatorVersions,
  aiWorkerFailureCodes,
  aiWorkerProviders,
} from './ai.constants'

export * from './ai.constants'

export const aiExplanationProviderSchema = z.enum(aiExplanationProviders)
export const aiWorkerProviderSchema = z.enum(aiWorkerProviders)
export const aiExplanationSourceSchema = z.enum(aiExplanationSources)
export const aiExplanationEvidenceKeySchema = z.enum(aiExplanationEvidenceKeys)
export const aiWorkerFailureCodeSchema = z.enum(aiWorkerFailureCodes)
export const aiPlanPromptVersionSchema = z.enum(aiPlanPromptVersions)
export const aiPlanValidatorVersionSchema = z.enum(aiPlanValidatorVersions)

export const aiExplanationHighlightSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    detail: z.string().trim().min(1).max(220),
    evidenceKeys: z.array(aiExplanationEvidenceKeySchema).min(1).max(3),
  })
  .strict()
  .superRefine((highlight, ctx) => {
    if (new Set(highlight.evidenceKeys).size !== highlight.evidenceKeys.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'evidenceKeys must be unique',
        path: ['evidenceKeys'],
      })
    }
  })

export const aiExplanationContentSchema = z
  .object({
    headline: z.string().trim().min(1).max(60),
    overview: z.string().trim().min(1).max(240),
    highlights: z.array(aiExplanationHighlightSchema).min(2).max(4),
    nextStep: z.string().trim().min(1).max(160),
  })
  .strict()

export const aiPlanContextSchema = z
  .object({
    planId: z.string().uuid(),
    planRevision: z.number().int().positive(),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(['draft', 'accepted', 'modified', 'skipped']),
    sessions: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            title: z.string().min(1).max(80),
            kind: planSessionKindSchema,
            plannedMinutes: z.number().int().min(10).max(90),
            intensity: planIntensitySchema,
            activities: z.array(z.string().min(1).max(80)).min(1).max(8),
          })
          .strict(),
      )
      .max(4),
    nutritionFocuses: z
      .array(
        z.object({ title: z.string().min(1).max(60), action: z.string().min(1).max(180) }).strict(),
      )
      .min(3)
      .max(4),
    reasons: z
      .array(
        z
          .object({
            code: z.string().min(2).max(80),
            label: z.string().min(1).max(60),
            detail: z.string().min(1).max(240),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    evidence: planEvidenceSchema,
    evidenceKeys: z.array(aiExplanationEvidenceKeySchema).min(1).max(7),
  })
  .strict()

export const aiWorkerRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    promptVersion: z.literal(aiPlanPromptVersion),
    validatorVersion: z.literal(aiPlanValidatorVersion),
    context: aiPlanContextSchema,
  })
  .strict()

export const aiWorkerUsageSchema = z
  .object({ inputTokens: z.number().int().min(0), outputTokens: z.number().int().min(0) })
  .strict()

export const aiWorkerResponseSchema = z
  .object({
    status: z.enum(['generated', 'failed']),
    provider: aiWorkerProviderSchema,
    model: z.string().trim().min(1).max(120),
    content: aiExplanationContentSchema.nullable(),
    failureCode: aiWorkerFailureCodeSchema.nullable(),
    providerResponseId: z.string().trim().min(1).max(200).nullable(),
    usage: aiWorkerUsageSchema.nullable(),
    latencyMs: z.number().int().min(0),
  })
  .strict()
  .superRefine((response, ctx) => {
    if (response.status === 'generated' && (!response.content || response.failureCode)) {
      ctx.addIssue({ code: 'custom', message: 'generated responses require content only' })
    }
    if (response.status === 'failed' && (response.content || !response.failureCode)) {
      ctx.addIssue({ code: 'custom', message: 'failed responses require a failureCode only' })
    }
  })

export const generateAiExplanationSchema = z
  .object({
    expectedPlanRevision: z.number().int().positive(),
    consent: z
      .object({
        purpose: z.literal('ai_plan_explanation'),
        version: z.literal(aiPlanConsentVersion),
        accepted: z.literal(true),
      })
      .strict(),
  })
  .strict()

export const aiExplanationSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().uuid(),
    planRevision: z.number().int().positive(),
    source: aiExplanationSourceSchema,
    provider: aiExplanationProviderSchema,
    model: z.string().trim().min(1).max(120),
    promptVersion: aiPlanPromptVersionSchema,
    validatorVersion: aiPlanValidatorVersionSchema,
    failureCode: aiWorkerFailureCodeSchema.nullable(),
    content: aiExplanationContentSchema,
    safetyNote: z.literal(aiPlanSafetyNote),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const aiExplanationHistorySchema = z
  .object({ planId: z.string().uuid(), items: z.array(aiExplanationSchema).max(20) })
  .strict()

export type AiExplanationContent = z.infer<typeof aiExplanationContentSchema>
export type AiPlanContext = z.infer<typeof aiPlanContextSchema>
export type AiWorkerRequest = z.infer<typeof aiWorkerRequestSchema>
export type AiWorkerResponse = z.infer<typeof aiWorkerResponseSchema>
export type AiWorkerFailureCode = z.infer<typeof aiWorkerFailureCodeSchema>
export type GenerateAiExplanation = z.infer<typeof generateAiExplanationSchema>
export type AiExplanation = z.infer<typeof aiExplanationSchema>
