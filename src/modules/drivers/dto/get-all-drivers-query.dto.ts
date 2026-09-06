import { Transform } from 'class-transformer';
import { FaceProfileStatus } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllDriversQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived: boolean = false;

  @IsOptional()
  @IsIn([...Object.values(FaceProfileStatus), 'NONE'])
  faceProfileStatus?: FaceProfileStatus | 'NONE';
}
