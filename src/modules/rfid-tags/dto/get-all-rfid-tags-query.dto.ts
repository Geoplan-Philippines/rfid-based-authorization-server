import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RFIDTagStatus } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllRfidTagsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RFIDTagStatus)
  status?: RFIDTagStatus;
}
