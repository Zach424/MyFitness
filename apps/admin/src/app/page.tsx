import { AdminConsole } from './admin-console'

export const dynamic = 'force-dynamic'

export default function Page() {
  const localLoginEnabled = process.env.ADMIN_ENABLE_LOCAL_LOGIN === 'true'
  const oidcEnabled = Boolean(
    process.env.ADMIN_OIDC_AUTHORIZATION_URL &&
    process.env.ADMIN_OIDC_TOKEN_URL &&
    process.env.ADMIN_OIDC_CLIENT_ID &&
    process.env.ADMIN_OIDC_CLIENT_SECRET &&
    process.env.ADMIN_OIDC_REDIRECT_URI,
  )
  return <AdminConsole localLoginEnabled={localLoginEnabled} oidcEnabled={oidcEnabled} />
}
