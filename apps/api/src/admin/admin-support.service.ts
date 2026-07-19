import { Injectable, NotFoundException } from '@nestjs/common'
import { supportUserSummarySchema, type SupportUserLookupRequest } from '@myfitness/contracts'
import type { QueryResultRow } from 'pg'

import { DatabaseService } from '../database/database.service'
import { AdminAuditService } from './admin-audit.service'
import type { AdminPrincipal } from './admin.types'

type SupportAccountRow = QueryResultRow & {
  account_id: string
  status: 'active' | 'disabled' | 'deletion_pending'
  created_at: Date
  updated_at: Date
  identity_providers: Array<'dev' | 'wechat' | 'phone'>
  profile_present: boolean
  goal_present: boolean
  profile_revision: number | null
  health_records: string
  workouts: string
  meals: string
  weekly_plans: string
  ai_explanations: string
  photo_analyses: string
  consent_receipts: string
  active_session_count: string
  active_photo_count: string
  latest_activity_at: Date | null
}

type ConsentRow = QueryResultRow & {
  purpose: 'ai_plan_explanation' | 'food_photo_analysis'
  accepted_at: Date
  revoked_at: Date | null
}

const consentState = (row: ConsentRow | undefined) =>
  !row ? ('never_granted' as const) : row.revoked_at ? ('revoked' as const) : ('active' as const)

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async lookup(principal: AdminPrincipal, input: SupportUserLookupRequest, requestId: string) {
    const outcome = await this.database.withTransaction(async (client) => {
      const accountResult = await client.query<SupportAccountRow>(
        `SELECT account.id AS account_id, account.status, account.created_at, account.updated_at,
                ARRAY(
                  SELECT DISTINCT identity.provider
                  FROM auth_identities AS identity
                  WHERE identity.user_id = account.id
                  ORDER BY identity.provider
                )::text[] AS identity_providers,
                EXISTS(SELECT 1 FROM user_profiles WHERE user_id = account.id) AS profile_present,
                EXISTS(SELECT 1 FROM user_goals WHERE user_id = account.id) AS goal_present,
                (SELECT revision FROM user_profiles WHERE user_id = account.id) AS profile_revision,
                (SELECT COUNT(*)::text FROM health_records WHERE user_id = account.id) AS health_records,
                (SELECT COUNT(*)::text FROM workout_sessions WHERE user_id = account.id) AS workouts,
                (SELECT COUNT(*)::text FROM nutrition_meals WHERE user_id = account.id) AS meals,
                (SELECT COUNT(*)::text FROM weekly_plans WHERE user_id = account.id) AS weekly_plans,
                (SELECT COUNT(*)::text FROM ai_explanation_runs WHERE user_id = account.id) AS ai_explanations,
                (SELECT COUNT(*)::text FROM nutrition_photo_candidates WHERE user_id = account.id) AS photo_analyses,
                (SELECT COUNT(*)::text FROM consent_events WHERE user_id = account.id) AS consent_receipts,
                (SELECT COUNT(*)::text FROM auth_sessions
                  WHERE user_id = account.id AND revoked_at IS NULL AND expires_at > NOW()) AS active_session_count,
                (SELECT COUNT(*)::text FROM nutrition_photo_candidates
                  WHERE user_id = account.id AND storage_key IS NOT NULL) AS active_photo_count,
                GREATEST(
                  account.updated_at,
                  (SELECT MAX(updated_at) FROM health_records WHERE user_id = account.id),
                  (SELECT MAX(updated_at) FROM workout_sessions WHERE user_id = account.id),
                  (SELECT MAX(updated_at) FROM nutrition_meals WHERE user_id = account.id),
                  (SELECT MAX(updated_at) FROM weekly_plans WHERE user_id = account.id),
                  (SELECT MAX(created_at) FROM ai_explanation_runs WHERE user_id = account.id),
                  (SELECT MAX(created_at) FROM nutrition_photo_candidates WHERE user_id = account.id)
                ) AS latest_activity_at
         FROM users AS account
         WHERE account.id = $1`,
        [input.accountId],
      )
      const account = accountResult.rows[0]
      if (!account) {
        const receipt = await this.audit.append(
          {
            operatorId: principal.operatorId,
            action: 'support.user.lookup',
            outcome: 'not_found',
            targetType: 'user',
            target: input.accountId,
            requestId,
            details: { ticketReference: input.ticketReference, reason: input.reason },
          },
          client,
        )
        return { summary: null, receipt }
      }

      const consents = await client.query<ConsentRow>(
        `SELECT DISTINCT ON (purpose) purpose, accepted_at, revoked_at
         FROM consent_events
         WHERE user_id = $1 AND purpose IN ('ai_plan_explanation', 'food_photo_analysis')
         ORDER BY purpose, accepted_at DESC`,
        [input.accountId],
      )
      const consentByPurpose = new Map(consents.rows.map((row) => [row.purpose, row]))
      const receipt = await this.audit.append(
        {
          operatorId: principal.operatorId,
          action: 'support.user.lookup',
          outcome: 'allowed',
          targetType: 'user',
          target: input.accountId,
          requestId,
          details: { ticketReference: input.ticketReference, reason: input.reason },
        },
        client,
      )
      const summary = supportUserSummarySchema.parse({
        lookupReceiptId: receipt.eventId,
        auditedAt: receipt.occurredAt,
        account: {
          accountId: account.account_id,
          status: account.status,
          createdAt: account.created_at.toISOString(),
          updatedAt: account.updated_at.toISOString(),
          identityProviders: account.identity_providers,
          onboarding: {
            profilePresent: account.profile_present,
            goalPresent: account.goal_present,
            profileRevision: account.profile_revision,
          },
          evidenceCounts: {
            healthRecords: Number(account.health_records),
            workouts: Number(account.workouts),
            meals: Number(account.meals),
            weeklyPlans: Number(account.weekly_plans),
            aiExplanations: Number(account.ai_explanations),
            photoAnalyses: Number(account.photo_analyses),
            consentReceipts: Number(account.consent_receipts),
          },
          activeSessionCount: Number(account.active_session_count),
          activePhotoCount: Number(account.active_photo_count),
          latestActivityAt: account.latest_activity_at?.toISOString() ?? null,
          optionalConsents: {
            aiPlanExplanation: consentState(consentByPurpose.get('ai_plan_explanation')),
            foodPhotoAnalysis: consentState(consentByPurpose.get('food_photo_analysis')),
          },
        },
      })
      return { summary, receipt }
    })

    if (!outcome.summary) {
      throw new NotFoundException({
        code: 'support_account_not_found',
        message: '没有找到该精确账户标识。',
        lookupReceiptId: outcome.receipt.eventId,
      })
    }
    return outcome.summary
  }
}
