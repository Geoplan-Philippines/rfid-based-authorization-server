import { Module } from '@nestjs/common';

import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ApiKeysModule, EmailModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
