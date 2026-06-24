import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';

export class GetDashboardOverviewQueryDTO {
  // Day to report on, as the gate's local date (YYYY-MM-DD). Defaults to today when omitted —
  // powers the dashboard's "Today" date selector. Validated as a real calendar date so an
  // impossible value (e.g. 2026-13-99) can't roll over silently in resolveDayStart.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  date?: string;
}
