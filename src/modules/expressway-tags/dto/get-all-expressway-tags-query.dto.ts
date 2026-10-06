import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ExpresswayTagStatus } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllExpresswayTagsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ExpresswayTagStatus)
  status?: ExpresswayTagStatus;
}
