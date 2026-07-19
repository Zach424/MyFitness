import { SetMetadata } from '@nestjs/common'

import type { RateLimitPolicy } from './operations.types'

export const rateLimitPolicyMetadata = 'myfitness:rate-limit-policy'
export const skipRateLimitMetadata = 'myfitness:skip-rate-limit'

export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(rateLimitPolicyMetadata, policy)
export const SkipRateLimit = () => SetMetadata(skipRateLimitMetadata, true)
