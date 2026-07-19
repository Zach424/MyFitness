import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'

import { AdminAuditController } from './admin/admin-audit.controller'
import { AdminAuditQueryService } from './admin/admin-audit-query.service'
import { AdminAuditService } from './admin/admin-audit.service'
import { AdminAuthController } from './admin/admin-auth.controller'
import { AdminAuthService } from './admin/admin-auth.service'
import { AdminRoleGuard } from './admin/admin-role.guard'
import { AdminSessionGuard } from './admin/admin-session.guard'
import { AdminSupportController } from './admin/admin-support.controller'
import { AdminSupportService } from './admin/admin-support.service'
import { AiController } from './ai/ai.controller'
import { AiService } from './ai/ai.service'
import { AuthController } from './auth/auth.controller'
import { AuthService } from './auth/auth.service'
import { SessionAuthGuard } from './auth/session-auth.guard'
import { DatabaseService } from './database/database.service'
import { HealthRecordsController } from './health-records/health-records.controller'
import { HealthRecordsService } from './health-records/health-records.service'
import { InsightsController } from './insights/insights.controller'
import { InsightsService } from './insights/insights.service'
import { HealthController } from './health/health.controller'
import { NutritionController } from './nutrition/nutrition.controller'
import { NutritionService } from './nutrition/nutrition.service'
import { PhotoCandidatesController } from './nutrition/photo-candidates.controller'
import { PhotoCandidatesService } from './nutrition/photo-candidates.service'
import { PhotoStorageService } from './nutrition/photo-storage.service'
import { OnboardingController } from './onboarding/onboarding.controller'
import { OnboardingService } from './onboarding/onboarding.service'
import { InternalOperationsGuard } from './operations/internal-operations.guard'
import { DataOperationsService } from './operations/data-operations.service'
import { IngressRateLimitGuard } from './operations/ingress-rate-limit.guard'
import { OperationalMetricsService } from './operations/operational-metrics.service'
import { OperationsController } from './operations/operations.controller'
import { ObjectStorageService } from './operations/object-storage.service'
import { RateLimitInterceptor } from './operations/rate-limit.interceptor'
import { RateLimitService } from './operations/rate-limit.service'
import { RedisService } from './operations/redis.service'
import { PlansController } from './plans/plans.controller'
import { PlansService } from './plans/plans.service'
import { PrivacyController } from './privacy/privacy.controller'
import { ErasureReceiptsController } from './privacy/erasure-receipts.controller'
import { ErasureLedgerService } from './privacy/erasure-ledger.service'
import { PrivacyService } from './privacy/privacy.service'
import { WorkoutsController } from './workouts/workouts.controller'
import { WorkoutsService } from './workouts/workouts.service'

@Module({
  controllers: [
    AdminAuditController,
    AdminAuthController,
    AdminSupportController,
    AiController,
    AuthController,
    ErasureReceiptsController,
    HealthController,
    HealthRecordsController,
    InsightsController,
    NutritionController,
    PhotoCandidatesController,
    OnboardingController,
    OperationsController,
    PlansController,
    PrivacyController,
    WorkoutsController,
  ],
  providers: [
    AdminAuditQueryService,
    AdminAuditService,
    AdminAuthService,
    AdminRoleGuard,
    AdminSessionGuard,
    AdminSupportService,
    AiService,
    AuthService,
    DatabaseService,
    DataOperationsService,
    ErasureLedgerService,
    HealthRecordsService,
    InsightsService,
    NutritionService,
    PhotoCandidatesService,
    PhotoStorageService,
    OnboardingService,
    InternalOperationsGuard,
    OperationalMetricsService,
    ObjectStorageService,
    PlansService,
    PrivacyService,
    RateLimitService,
    RedisService,
    {
      provide: APP_GUARD,
      useClass: IngressRateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor,
    },
    SessionAuthGuard,
    WorkoutsService,
  ],
})
export class AppModule {}
