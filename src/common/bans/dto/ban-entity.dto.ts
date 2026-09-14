import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';

import { IsCalendarDate } from 'src/common/validators/is-calendar-date.validator';

function normalizeBoolean(value: unknown, fallback: unknown): unknown {
  const raw = value !== undefined ? value : fallback;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
}

function normalizeCalendarDate(value: unknown, fallback?: unknown): unknown {
  const raw = value !== undefined ? value : fallback;
  return typeof raw === 'string' ? raw.trim() : raw;
}

export class BanEntityDTO {
  @ApiPropertyOptional({
    description: 'True for a permanent ban. False for a timed ban requiring from and to dates.',
    example: false,
  })
  @ValidateIf((o) => o.isPermanent === undefined)
  @IsBoolean({ message: 'A ban must specify whether it is permanent or timed' })
  @Transform(({ value, obj }) => normalizeBoolean(value, obj?.isPermanent))
  permanent?: boolean;

  @ApiPropertyOptional({
    description: 'Legacy alias for permanent. True for a permanent ban.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value, obj }) => normalizeBoolean(value, obj?.permanent))
  @IsBoolean()
  isPermanent?: boolean;

  @ApiPropertyOptional({
    description: 'Inclusive start calendar day of a timed ban (YYYY-MM-DD). May be today or in the future.',
    example: '2026-09-21',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeCalendarDate(value))
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end calendar day of a timed ban (YYYY-MM-DD). Required for timed bans.',
    example: '2026-10-05',
  })
  @IsOptional()
  @Transform(({ value, obj }) => normalizeCalendarDate(value, obj?.until))
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    description: 'Legacy alias for to (inclusive last calendar day of a timed ban, YYYY-MM-DD).',
    example: '2026-10-05',
  })
  @IsOptional()
  @Transform(({ value, obj }) => normalizeCalendarDate(value, obj?.to))
  @IsCalendarDate()
  until?: string;
}
