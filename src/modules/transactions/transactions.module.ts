import { Module } from '@nestjs/common';

import { FaceModule } from '../face/face.module';
import { FaceGateService } from '../face/face-gate.service';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ApiKeysModule, EmailModule, FaceModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, FaceGateService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
