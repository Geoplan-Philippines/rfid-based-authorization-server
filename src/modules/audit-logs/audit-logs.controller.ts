import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLog } from '@prisma/client';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { AuditLogsService } from './audit-logs.service';
import { GetAllAuditLogsQueryDTO } from './dto/get-all-audit-logs-query.dto';

@Controller('audit-logs')
@UseGuards(PassportJwtGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  async getAllAuditLogs(@Query() query: GetAllAuditLogsQueryDTO): Promise<PaginatedResponse<AuditLog>> {
    return this.auditLogsService.getAllAuditLogs(query);
  }
}
