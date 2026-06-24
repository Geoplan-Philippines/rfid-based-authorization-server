import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { GateEventResult } from '@prisma/client';

export class GetAllTransactionsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsEnum(GateEventResult)
  result?: GateEventResult;
}
