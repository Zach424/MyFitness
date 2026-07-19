import { adminAuditListQuerySchema, adminAuditListSchema } from '@myfitness/contracts'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { adminApi, adminSessionCookie, safeApiError } from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const accessToken = (await cookies()).get(adminSessionCookie)?.value
  if (!accessToken) {
    return NextResponse.json(
      { code: 'admin_session_required', message: '请先验证操作员身份。' },
      { status: 401 },
    )
  }
  const source = new URL(request.url).searchParams
  const query = adminAuditListQuerySchema.safeParse({
    ...(source.get('limit') ? { limit: source.get('limit') } : {}),
    ...(source.get('cursor') ? { cursor: source.get('cursor') } : {}),
  })
  if (!query.success) {
    return NextResponse.json(
      { code: 'audit_query_invalid', message: '审计页码无效。' },
      { status: 400 },
    )
  }
  const params = new URLSearchParams({ limit: String(query.data.limit) })
  if (query.data.cursor) params.set('cursor', query.data.cursor)
  const result = await adminApi(`/admin/audit?${params}`, { method: 'GET' }, accessToken)
  const parsed = adminAuditListSchema.safeParse(result.body)
  if (!parsed.success) {
    return NextResponse.json(safeApiError(result), { status: result.status })
  }
  return NextResponse.json(parsed.data, { headers: { 'Cache-Control': 'no-store, private' } })
}
