import { Module } from '@nestjs/common';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';

@Module({
  imports: [AuditLogsModule],
  controllers: [DriversController],
  providers: [DriversService, GateEventAnalyticsService, ImageUploadService],
  exports: [DriversService],
})
export class DriversModule {}
