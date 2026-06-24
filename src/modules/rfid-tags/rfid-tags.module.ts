import { Module } from '@nestjs/common';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RfidTagsService } from './rfid-tags.service';
import { RfidTagsController } from './rfid-tags.controller';

@Module({
  imports: [AuditLogsModule],
  controllers: [RfidTagsController],
  providers: [RfidTagsService, GateEventAnalyticsService],
  exports: [RfidTagsService],
})
export class RfidTagsModule {}
