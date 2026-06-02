import { Module } from '@nestjs/common';

import { TruckDriverAssignmentService } from './truck-driver-assignment.service';
import { TruckDriverAssignmentController } from './truck-driver-assignment.controller';

@Module({
  controllers: [TruckDriverAssignmentController],
  providers: [TruckDriverAssignmentService],
  exports: [TruckDriverAssignmentService],
})
export class TruckDriverAssignmentModule {}
