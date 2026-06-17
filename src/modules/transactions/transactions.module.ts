import { Module } from '@nestjs/common';

import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [ApiKeysModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
