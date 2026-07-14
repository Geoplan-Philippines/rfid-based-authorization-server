import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';

export class GetPeakHoursQueryDTO {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  to?: string;
}
