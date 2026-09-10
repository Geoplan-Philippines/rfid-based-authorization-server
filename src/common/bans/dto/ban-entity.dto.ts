import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';

export class BanEntityDTO {
  @ApiProperty({
    description: 'True for a permanent ban. False requires until as the last ineligible calendar day.',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPermanent!: boolean;

  @ApiPropertyOptional({
    description: 'Inclusive last calendar day of a timed ban (YYYY-MM-DD). Required when isPermanent is false.',
    example: '2026-12-31',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  until?: string;
}
