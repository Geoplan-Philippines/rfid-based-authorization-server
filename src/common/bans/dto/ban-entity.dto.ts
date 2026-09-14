import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';

export class BanEntityDTO {
  @ApiPropertyOptional({
    description: 'True for a permanent ban. False for a timed ban requiring from and to dates.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const raw = value !== undefined ? value : obj?.isPermanent;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  permanent?: boolean;

  @ApiPropertyOptional({
    description: 'Legacy alias for permanent. True for a permanent ban.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const raw = value !== undefined ? value : obj?.permanent;
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  isPermanent?: boolean;

  @ApiPropertyOptional({
    description: 'Inclusive start calendar day of a timed ban (YYYY-MM-DD). May be today or in the future.',
    example: '2026-09-21',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end calendar day of a timed ban (YYYY-MM-DD). Required for timed bans.',
    example: '2026-10-05',
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const val = value !== undefined ? value : obj?.until;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    description: 'Legacy alias for to (inclusive last calendar day of a timed ban, YYYY-MM-DD).',
    example: '2026-10-05',
  })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const val = value !== undefined ? value : obj?.to;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsCalendarDate()
  until?: string;
}
