import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { EXCEPTION_GATE_EVENT_RESULTS } from 'src/common/gate-events/gate-event.constants';
import type { ExceptionGateEventResult } from 'src/common/gate-events/gate-event.constants';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';

export class GetExceptionsReportQueryDTO extends PaginationQueryDTO {
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn([...EXCEPTION_GATE_EVENT_RESULTS], { message: 'result must be a valid exception result' })
  result?: ExceptionGateEventResult;
}
