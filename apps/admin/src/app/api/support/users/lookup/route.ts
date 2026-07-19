import { supportUserLookupRequestSchema, supportUserSummarySchema } from '@myfitness/contracts'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { adminApi, adminSessionCookie, safeApiError } from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const accessToken = (await cookies()).get(adminSessionCookie)?.value
  if (!accessToken) {
    return NextResponse.json(
      { code: 'admin_session_required', message: '请先验证操作员身份。' },
      { status: 401 },
    )
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const input = supportUserLookupRequestSchema.safeParse(body)
  if (!input.success) {
    return NextResponse.json(
      { code: 'support_lookup_invalid', message: '请填写精确账户 ID、工单号和查询原因。' },
      { status: 400 },
    )
  }
  const result = await adminApi(
    '/admin/support/users/lookup',
    { method: 'POST', body: JSON.stringify(input.data) },
    accessToken,
  )
  const parsed = supportUserSummarySchema.safeParse(result.body)
  if (!parsed.success) {
    return NextResponse.json(safeApiError(result), { status: result.status })
  }
  return NextResponse.json(parsed.data, { headers: { 'Cache-Control': 'no-store, private' } })
}
