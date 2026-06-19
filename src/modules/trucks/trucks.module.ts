import { Module } from '@nestjs/common';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TrucksService } from './trucks.service';
import { TrucksController } from './trucks.controller';

@Module({
  imports: [AuditLogsModule],
  controllers: [TrucksController],
  providers: [TrucksService, GateEventAnalyticsService, ImageUploadService],
  exports: [TrucksService],
})
export class TrucksModule {}
