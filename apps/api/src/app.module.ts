import { Module } from '@nestjs/common'

import { AuthController } from './auth/auth.controller'
import { AuthService } from './auth/auth.service'
import { SessionAuthGuard } from './auth/session-auth.guard'
import { DatabaseService } from './database/database.service'
import { HealthRecordsController } from './health-records/health-records.controller'
import { HealthRecordsService } from './health-records/health-records.service'
import { HealthController } from './health/health.controller'
import { NutritionController } from './nutrition/nutrition.controller'
import { NutritionService } from './nutrition/nutrition.service'
import { OnboardingController } from './onboarding/onboarding.controller'
import { OnboardingService } from './onboarding/onboarding.service'
import { WorkoutsController } from './workouts/workouts.controller'
import { WorkoutsService } from './workouts/workouts.service'

@Module({
  controllers: [
    AuthController,
    HealthController,
    HealthRecordsController,
    NutritionController,
    OnboardingController,
    WorkoutsController,
  ],
  providers: [
    AuthService,
    DatabaseService,
    HealthRecordsService,
    NutritionService,
    OnboardingService,
    SessionAuthGuard,
    WorkoutsService,
  ],
})
export class AppModule {}
