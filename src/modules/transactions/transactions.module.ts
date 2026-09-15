import { Module } from '@nestjs/common';

import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionEventsService } from './transaction-events.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { EmailModule } from '../email/email.module';
import { BarrierModule } from '../barrier/barrier.module';

@Module({
  imports: [ApiKeysModule, EmailModule, BarrierModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionEventsService],
  exports: [TransactionsService, TransactionEventsService],
})
export class TransactionsModule {}
