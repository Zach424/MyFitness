import { BadRequestException, Injectable } from '@nestjs/common'
import { adminAuditListSchema, type AdminAuditListQuery } from '@myfitness/contracts'

import { DatabaseService } from '../database/database.service'
import { type AuditRow, AdminAuditService, mapAuditRow } from './admin-audit.service'
import type { AdminPrincipal } from './admin.types'

type Cursor = { occurredAt: string; eventId: string }

const encodeCursor = (event: { occurredAt: string; eventId: string }) =>
  Buffer.from(JSON.stringify({ occurredAt: event.occurredAt, eventId: event.eventId })).toString(
    'base64url',
  )

const decodeCursor = (value: string | undefined): Cursor | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>
    if (
      typeof parsed.occurredAt !== 'string' ||
      Number.isNaN(new Date(parsed.occurredAt).getTime()) ||
      typeof parsed.eventId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.eventId)
    ) {
      throw new Error('invalid cursor shape')
    }
    return { occurredAt: parsed.occurredAt, eventId: parsed.eventId }
  } catch {
    throw new BadRequestException('administrator audit cursor is invalid')
  }
}

@Injectable()
export class AdminAuditQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(principal: AdminPrincipal, query: AdminAuditListQuery, requestId: string) {
    const cursor = decodeCursor(query.cursor)
    const result = await this.database.withTransaction(async (client) => {
      const rows = await client.query<AuditRow>(
        `SELECT id, operator_id, action, outcome, target_type, target_ref,
                request_id, details, occurred_at
         FROM admin_audit_events
         WHERE ($1::timestamptz IS NULL OR (occurred_at, id) < ($1::timestamptz, $2::uuid))
         ORDER BY occurred_at DESC, id DESC
         LIMIT $3`,
        [cursor?.occurredAt ?? null, cursor?.eventId ?? null, query.limit + 1],
      )
      const hasMore = rows.rows.length > query.limit
      const events = rows.rows.slice(0, query.limit).map(mapAuditRow)
      await this.audit.append(
        {
          operatorId: principal.operatorId,
          action: 'audit.events.read',
          outcome: 'allowed',
          targetType: 'audit',
          target: 'admin-audit-events',
          requestId,
          details: { returnedCount: events.length },
        },
        client,
      )
      return {
        events,
        nextCursor: hasMore && events.length ? encodeCursor(events[events.length - 1]!) : null,
      }
    })
    return adminAuditListSchema.parse(result)
  }
}
