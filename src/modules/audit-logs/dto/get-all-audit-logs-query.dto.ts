import { IsOptional, IsString } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllAuditLogsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  action?: string;
}
