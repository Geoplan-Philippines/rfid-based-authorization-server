import { Module } from '@nestjs/common';
import { BarrierService } from './barrier.service';

@Module({
  providers: [BarrierService],
  exports: [BarrierService],
})
export class BarrierModule {}
