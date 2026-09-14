import { Body, Controller, Get, Header, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { TransactionsService } from './transactions.service';
import { GetAllTransactionsQueryDTO } from './dto/get-all-transactions-query.dto';
import { RecordRfidReadDTO } from './dto/record-rfid-read.dto';
import { RecordPlateReadDTO } from './dto/record-plate-read.dto';
import { RecordFaceReadDTO } from './dto/record-face-read.dto';
import { RecordBarrierEventDTO } from './dto/record-barrier-event.dto';
import { TransactionDetail, TransactionListResponse, type TransactionEventType } from './types/transactions.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

// TODO: Apply RolesGuard and @Roles() decorator to the operator-facing routes.
// The ingestion routes below are the contracts each gate device/service POSTs to. They are
// authenticated by a shared device credential (x-api-key header) via ApiKeyGuard, not a
// human-login JWT. barrier-events stays JWT-guarded: it records the acting operator.
@ApiTags('Transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  // @UseGuards(PassportJwtGuard)
  async getAllTransactions(@Query() query: GetAllTransactionsQueryDTO): Promise<TransactionListResponse> {
    return this.transactionsService.getAllTransactions(query);
  }

  // Realtime Server-Sent Events stream for connected dashboards / transactions list.
  // Pushes transaction.created when the RFID reader logs a new read.
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({
    summary: 'Stream transaction events in realtime (SSE)',
    description:
      'Server-Sent Events stream pushing `transaction.created` when a new transaction is created by the RFID bridge. ' +
      'Carries enough transaction fields for the transactions list to show the new row in realtime.',
  })
  @ApiProduces('text/event-stream')
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['transaction.created', 'transaction.updated'],
    description: 'Filter by event type. Omit to receive all transaction events.',
  })
  @ApiOkResponse({
    description: 'Server-Sent Events stream emitting transaction events',
  })
  streamTransactions(@Query('type') type?: TransactionEventType): Observable<MessageEvent> {
    return this.transactionsService.streamTransactions(type);
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async getTransactionById(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionDetail> {
    return this.transactionsService.getTransactionById(id);
  }

  // Stage 1 — RFID reader. Opens a new transaction.
  @Post('rfid-reads')
  @UseGuards(ApiKeyGuard)
  async recordRfidRead(@Body() body: RecordRfidReadDTO): Promise<TransactionDetail> {
    return this.transactionsService.recordRfidRead(body);
  }

  // Stage 2 — plate-recognition (OCR) service. Patches the latest open transaction.
  @Post('plate-reads')
  async recordPlateRead(@Body() body: RecordPlateReadDTO): Promise<TransactionDetail> {
    return this.transactionsService.recordPlateRead(body);
  }

  // Stage 3 — face-recognition service. Patches the latest open transaction.
  @Post('face-reads')
  async recordFaceRead(@Body() body: RecordFaceReadDTO): Promise<TransactionDetail> {
    return this.transactionsService.recordFaceRead(body);
  }

  // Stage 4 — barrier open. Closes the transaction (the last step). Triggered from the operator
  // console; in production the RFID controller also opens the boom locally (GPIO) on a valid tag.
  // Opening a flagged (non-VERIFIED) transaction is a manual override: the acting operator (from
  // the JWT) and optional reason are recorded, and the result becomes MANUAL_OVERRIDE.
  @Post('barrier-events')
  @UseGuards(PassportJwtGuard)
  async recordBarrierOpened(
    @CurrentUser() operator: AuthenticatedUser,
    @Body() body: RecordBarrierEventDTO,
  ): Promise<TransactionDetail> {
    return this.transactionsService.recordBarrierOpened(operator, body);
  }
}
