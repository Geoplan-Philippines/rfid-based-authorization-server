import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class GetMonthlyBreakdownQueryDTO {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
  month?: string;
}
