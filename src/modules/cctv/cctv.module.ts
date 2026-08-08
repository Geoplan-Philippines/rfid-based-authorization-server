import { Module } from '@nestjs/common';
import { CctvController } from './cctv.controller';
import { CctvService } from './cctv.service';
import { AnprWorkerService } from './anpr-worker.service';

@Module({
  controllers: [CctvController],
  providers: [CctvService, AnprWorkerService],
  exports: [CctvService],
})
export class CctvModule {}
