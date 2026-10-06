import { Module } from '@nestjs/common';
import { ExpresswayTagsService } from './expressway-tags.service';
import { ExpresswayTagsController } from './expressway-tags.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [ExpresswayTagsController],
  providers: [ExpresswayTagsService],
  exports: [ExpresswayTagsService],
})
export class ExpresswayTagsModule {}
