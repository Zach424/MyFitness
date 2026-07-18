import { Module } from '@nestjs/common'

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
import { PlansController } from './plans/plans.controller'
import { PlansService } from './plans/plans.service'
import { PrivacyController } from './privacy/privacy.controller'
import { PrivacyService } from './privacy/privacy.service'
import { WorkoutsController } from './workouts/workouts.controller'
import { WorkoutsService } from './workouts/workouts.service'

@Module({
  controllers: [
    AiController,
    AuthController,
    HealthController,
    HealthRecordsController,
    InsightsController,
    NutritionController,
    PhotoCandidatesController,
    OnboardingController,
    PlansController,
    PrivacyController,
    WorkoutsController,
  ],
  providers: [
    AiService,
    AuthService,
    DatabaseService,
    HealthRecordsService,
    InsightsService,
    NutritionService,
    PhotoCandidatesService,
    PhotoStorageService,
    OnboardingService,
    PlansService,
    PrivacyService,
    SessionAuthGuard,
    WorkoutsService,
  ],
})
export class AppModule {}
