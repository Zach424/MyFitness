import { randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { OnboardingRequest, OnboardingResponse, RiskFlag } from '@myfitness/contracts'
import { determineEligibility, MeasurementError, normalizeHeight } from '@myfitness/domain'

import { DatabaseService } from '../database/database.service'

type ProfileRow = {
  user_id: string
  display_name: string
  age_band: OnboardingResponse['profile']['ageBand']
  sex_for_calculations: OnboardingResponse['profile']['sexForCalculations']
  height_cm: string
  display_height: string
  display_height_unit: 'cm' | 'in'
  unit_system: OnboardingResponse['profile']['unitSystem']
  timezone: string
  risk_status: OnboardingResponse['eligibility']['status']
  risk_flags: RiskFlag[]
  revision: number
  primary_goal: OnboardingResponse['goal']['primaryGoal']
  experience: OnboardingResponse['goal']['experience']
  available_days: OnboardingResponse['goal']['availableDays']
  session_minutes: number
  equipment: OnboardingResponse['goal']['equipment']
  dietary_preferences: OnboardingResponse['goal']['dietaryPreferences']
  created_at: Date
  updated_at: Date
}

type ConsentRow = {
  purpose: OnboardingResponse['consents'][number]['purpose']
  version: string
  accepted_at: Date
}

@Injectable()
export class OnboardingService {
  constructor(private readonly database: DatabaseService) {}

  async upsert(userId: string, input: OnboardingRequest) {
    let height: ReturnType<typeof normalizeHeight>
    try {
      height = normalizeHeight(input.profile.height.value, input.profile.height.unit)
    } catch (error) {
      if (error instanceof MeasurementError) throw new BadRequestException(error.message)
      throw error
    }
    const eligibility = determineEligibility(input.risk.flags)

    await this.database.withTransaction(async (client) => {
      const current = await client.query<{ revision: number }>(
        'SELECT revision FROM user_profiles WHERE user_id = $1 FOR UPDATE',
        [userId],
      )
      const currentRevision = current.rows[0]?.revision

      if (currentRevision !== undefined) {
        if (input.expectedRevision !== currentRevision) {
          throw new ConflictException(`profile revision is ${currentRevision}`)
        }
        await client.query(
          `
            UPDATE user_profiles
            SET display_name = $2,
                age_band = $3,
                sex_for_calculations = $4,
                height_cm = $5,
                display_height = $6,
                display_height_unit = $7,
                unit_system = $8,
                timezone = $9,
                risk_status = $10,
                risk_flags = $11,
                revision = revision + 1,
                updated_at = NOW()
            WHERE user_id = $1
          `,
          [
            userId,
            input.profile.displayName,
            input.profile.ageBand,
            input.profile.sexForCalculations,
            height.canonicalHeightCm,
            height.displayHeight.value,
            height.displayHeight.unit,
            input.profile.unitSystem,
            input.profile.timezone,
            eligibility.status,
            eligibility.riskFlags,
          ],
        )
      } else {
        if (input.expectedRevision !== undefined && input.expectedRevision !== 0) {
          throw new ConflictException(
            'profile does not exist; expectedRevision must be 0 or omitted',
          )
        }
        await client.query(
          `
            INSERT INTO user_profiles (
              user_id, display_name, age_band, sex_for_calculations,
              height_cm, display_height, display_height_unit, unit_system,
              timezone, adult_confirmed_at, risk_status, risk_flags
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
          `,
          [
            userId,
            input.profile.displayName,
            input.profile.ageBand,
            input.profile.sexForCalculations,
            height.canonicalHeightCm,
            height.displayHeight.value,
            height.displayHeight.unit,
            input.profile.unitSystem,
            input.profile.timezone,
            eligibility.status,
            eligibility.riskFlags,
          ],
        )
      }

      await client.query(
        `
          INSERT INTO user_goals (
            user_id, primary_goal, experience, available_days,
            session_minutes, equipment, dietary_preferences
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (user_id) DO UPDATE SET
            primary_goal = EXCLUDED.primary_goal,
            experience = EXCLUDED.experience,
            available_days = EXCLUDED.available_days,
            session_minutes = EXCLUDED.session_minutes,
            equipment = EXCLUDED.equipment,
            dietary_preferences = EXCLUDED.dietary_preferences,
            updated_at = NOW()
        `,
        [
          userId,
          input.goal.primaryGoal,
          input.goal.experience,
          input.goal.availableDays,
          input.goal.sessionMinutes,
          input.goal.equipment,
          input.goal.dietaryPreferences,
        ],
      )

      const consents = [
        ['terms', input.consents.terms.version],
        ['privacy', input.consents.privacy.version],
        ['health_data', input.consents.healthData.version],
      ] as const
      for (const [purpose, version] of consents) {
        await client.query(
          `
            INSERT INTO consent_events (id, user_id, purpose, version)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, purpose, version) DO NOTHING
          `,
          [randomUUID(), userId, purpose, version],
        )
      }
    })

    return this.get(userId)
  }

  async get(userId: string): Promise<OnboardingResponse> {
    const profileResult = await this.database.query<ProfileRow>(
      `
        SELECT profile.*, goal.primary_goal, goal.experience, goal.available_days,
               goal.session_minutes, goal.equipment, goal.dietary_preferences
        FROM user_profiles AS profile
        JOIN user_goals AS goal ON goal.user_id = profile.user_id
        WHERE profile.user_id = $1
      `,
      [userId],
    )
    const row = profileResult.rows[0]
    if (!row) throw new NotFoundException('onboarding profile not found')

    const consentResult = await this.database.query<ConsentRow>(
      `
        SELECT purpose, version, accepted_at
        FROM consent_events
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY CASE purpose WHEN 'terms' THEN 1 WHEN 'privacy' THEN 2 ELSE 3 END
      `,
      [userId],
    )

    return {
      userId: row.user_id,
      revision: row.revision,
      profile: {
        displayName: row.display_name,
        ageBand: row.age_band,
        sexForCalculations: row.sex_for_calculations,
        canonicalHeightCm: Number(row.height_cm),
        displayHeight: { value: Number(row.display_height), unit: row.display_height_unit },
        unitSystem: row.unit_system,
        timezone: row.timezone,
      },
      goal: {
        primaryGoal: row.primary_goal,
        experience: row.experience,
        availableDays: row.available_days,
        sessionMinutes: row.session_minutes,
        equipment: row.equipment,
        dietaryPreferences: row.dietary_preferences,
      },
      eligibility: { status: row.risk_status, riskFlags: row.risk_flags },
      consents: consentResult.rows.map((consent) => ({
        purpose: consent.purpose,
        version: consent.version,
        acceptedAt: consent.accepted_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }
}
