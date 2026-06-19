import { Module } from '@nestjs/common';

import { RfidTagsService } from './rfid-tags.service';
import { RfidTagsController } from './rfid-tags.controller';

@Module({
  controllers: [RfidTagsController],
  providers: [RfidTagsService],
  exports: [RfidTagsService],
})
export class RfidTagsModule {}
