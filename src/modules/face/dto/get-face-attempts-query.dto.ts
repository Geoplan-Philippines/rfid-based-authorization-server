import { FaceRecognitionOutcome } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetFaceAttemptsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsEnum(FaceRecognitionOutcome)
  outcome?: FaceRecognitionOutcome;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  maxSimilarity?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  reviewed?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
