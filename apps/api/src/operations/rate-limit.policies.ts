import type { RateLimitPolicy } from './operations.types'

export const rateLimitPolicies = {
  ingress: { name: 'api_ingress', limit: 1_200, windowSeconds: 60, scope: 'ip' },
  standard: { name: 'api_standard', limit: 600, windowSeconds: 60, scope: 'auto' },
  authSession: { name: 'auth_session', limit: 60, windowSeconds: 60, scope: 'ip' },
  aiExplanation: { name: 'ai_explanation', limit: 20, windowSeconds: 60, scope: 'user' },
  photoReservation: {
    name: 'photo_reservation',
    limit: 30,
    windowSeconds: 60,
    scope: 'user',
  },
  photoUpload: { name: 'photo_upload', limit: 12, windowSeconds: 60, scope: 'user' },
  privacyExport: { name: 'privacy_export', limit: 6, windowSeconds: 300, scope: 'user' },
  privacyRevocation: {
    name: 'privacy_revocation',
    limit: 10,
    windowSeconds: 300,
    scope: 'user',
  },
  accountErasure: {
    name: 'account_erasure',
    limit: 3,
    windowSeconds: 3_600,
    scope: 'user',
  },
} as const satisfies Record<string, RateLimitPolicy>
