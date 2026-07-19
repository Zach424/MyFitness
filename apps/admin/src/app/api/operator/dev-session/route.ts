import { adminSessionSchema } from '@myfitness/contracts'
import { NextResponse } from 'next/server'

import {
  adminApi,
  adminSessionCookie,
  localOperator,
  safeApiError,
  sessionCookieOptions,
} from '@/lib/admin-server'

export const dynamic = 'force-dynamic'

export async function POST() {
  if (process.env.ADMIN_ENABLE_LOCAL_LOGIN !== 'true') {
    return NextResponse.json(
      { code: 'local_login_disabled', message: '本地管理员签发器未启用。' },
      { status: 404 },
    )
  }
  const result = await adminApi('/admin/auth/dev/session', {
    method: 'POST',
    body: JSON.stringify(localOperator()),
  })
  const parsed = adminSessionSchema.safeParse(result.body)
  if (!parsed.success) {
    return NextResponse.json(safeApiError(result), { status: result.status })
  }
  const response = NextResponse.json({ operator: parsed.data.operator })
  response.headers.set('Cache-Control', 'no-store, private')
  response.cookies.set(
    adminSessionCookie,
    parsed.data.accessToken,
    sessionCookieOptions(parsed.data.expiresAt),
  )
  return response
}
