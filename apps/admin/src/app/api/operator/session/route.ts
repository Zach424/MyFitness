import { adminOperatorSchema } from '@myfitness/contracts'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { adminApi, adminSessionCookie, clearSessionCookie, safeApiError } from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const accessToken = (await cookies()).get(adminSessionCookie)?.value
  if (!accessToken) {
    return NextResponse.json(
      { code: 'admin_session_required', message: '请先验证操作员身份。' },
      { status: 401 },
    )
  }
  const result = await adminApi('/admin/auth/me', { method: 'GET' }, accessToken)
  const parsed = adminOperatorSchema.safeParse(result.body)
  if (!parsed.success) {
    const response = NextResponse.json(safeApiError(result), { status: result.status })
    if ([401, 403].includes(result.status)) clearSessionCookie(response)
    return response
  }
  return NextResponse.json({ operator: parsed.data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE() {
  const accessToken = (await cookies()).get(adminSessionCookie)?.value
  if (accessToken) {
    await adminApi('/admin/auth/session', { method: 'DELETE' }, accessToken)
  }
  const response = new NextResponse(null, { status: 204 })
  clearSessionCookie(response)
  return response
}
