import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { TruckDriverAssignmentController } from './truck-driver-assignment.controller';

@Module({
  imports: [AuditLogsModule],
  controllers: [TruckDriverAssignmentController],
  providers: [TruckDriverAssignmentService],
  exports: [TruckDriverAssignmentService],
})
export class TruckDriverAssignmentModule {}
