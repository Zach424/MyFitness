import { createHmac, randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import {
  adminAuditEventSchema,
  type AdminAuditAction,
  type AdminAuditEvent,
  type AdminAuditOutcome,
  type AdminAuditTargetType,
} from '@myfitness/contracts'
import type { PoolClient, QueryResultRow } from 'pg'

import { getRuntimeConfig } from '../config'
import { DatabaseService } from '../database/database.service'

type AuditDetails = Record<string, string | number | boolean | null>

type AppendAuditInput = {
  operatorId?: string | null
  action: AdminAuditAction
  outcome: AdminAuditOutcome
  targetType?: AdminAuditTargetType | null
  target?: string | null
  requestId: string
  details?: AuditDetails
}

type AuditRow = QueryResultRow & {
  id: string
  operator_id: string | null
  action: AdminAuditAction
  outcome: AdminAuditOutcome
  target_type: AdminAuditTargetType | null
  target_ref: string | null
  request_id: string
  details: AuditDetails
  occurred_at: Date
}

const validateDetails = (details: AuditDetails) => {
  const entries = Object.entries(details)
  if (entries.length > 8) throw new Error('admin audit details exceed the bounded field count')
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) {
      throw new Error('admin audit detail key is invalid')
    }
    if (typeof value === 'string' && value.length > 160) {
      throw new Error('admin audit detail value is too long')
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('admin audit detail number must be finite')
    }
  }
  return details
}

export const mapAuditRow = (row: AuditRow): AdminAuditEvent =>
  adminAuditEventSchema.parse({
    eventId: row.id,
    operatorId: row.operator_id,
    action: row.action,
    outcome: row.outcome,
    targetType: row.target_type,
    targetRef: row.target_ref,
    requestId: row.request_id,
    details: row.details,
    occurredAt: row.occurred_at.toISOString(),
  })

@Injectable()
export class AdminAuditService {
  private readonly hashSecret = getRuntimeConfig().adminAuditHashSecret

  constructor(private readonly database: DatabaseService) {}

  targetRef(target: string) {
    return createHmac('sha256', this.hashSecret).update(target).digest('hex')
  }

  async append(input: AppendAuditInput, client?: PoolClient) {
    const targetType = input.targetType ?? null
    const targetRef = input.target ? this.targetRef(input.target) : null
    if ((targetType === null) !== (targetRef === null)) {
      throw new Error('admin audit target type and target must be provided together')
    }
    const values = [
      randomUUID(),
      input.operatorId ?? null,
      input.action,
      input.outcome,
      targetType,
      targetRef,
      input.requestId,
      JSON.stringify(validateDetails(input.details ?? {})),
    ]
    const sql = `
      INSERT INTO admin_audit_events (
        id, operator_id, action, outcome, target_type, target_ref, request_id, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id, operator_id, action, outcome, target_type, target_ref,
                request_id, details, occurred_at
    `
    const result = client
      ? await client.query<AuditRow>(sql, values)
      : await this.database.query<AuditRow>(sql, values)
    return mapAuditRow(result.rows[0]!)
  }
}

export type { AuditRow }
