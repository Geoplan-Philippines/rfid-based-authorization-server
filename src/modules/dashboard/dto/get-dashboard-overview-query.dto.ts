import { Transform } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';

export class GetDashboardOverviewQueryDTO {
  // Day to report on, as the gate's local date (YYYY-MM-DD). Defaults to today when omitted —
  // powers the dashboard's "Today" date selector.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;
}
