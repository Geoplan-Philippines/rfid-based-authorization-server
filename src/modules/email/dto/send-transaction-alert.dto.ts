import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEmail, IsNotEmpty, IsObject } from 'class-validator';

import type { TransactionDetail } from '../../transactions/types/transactions.types';

export class SendTransactionAlertDto {
  // Accept a single address or a list; normalize to an array so the service has one shape to handle.
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  to!: string[];

  // The transaction detail returned by the transactions pipeline (the alert's data source).
  @IsObject()
  @IsNotEmpty()
  transaction!: TransactionDetail;
}
