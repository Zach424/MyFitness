import { Module } from '@nestjs/common'

import { DatabaseService } from './database/database.service'
import { HealthRecordsController } from './health-records/health-records.controller'
import { HealthRecordsService } from './health-records/health-records.service'
import { HealthController } from './health/health.controller'

@Module({
  controllers: [HealthController, HealthRecordsController],
  providers: [DatabaseService, HealthRecordsService],
})
export class AppModule {}
