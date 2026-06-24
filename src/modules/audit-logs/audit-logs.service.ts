import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PrismaService } from 'src/core/database/prisma.service';
import { GetAllAuditLogsQueryDTO } from './dto/get-all-audit-logs-query.dto';

type AuditLogClient = Prisma.TransactionClient | PrismaService;

export interface RecordAuditLogInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordAuditLog(input: RecordAuditLogInput, client: AuditLogClient = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async getAllAuditLogs(query: GetAllAuditLogsQueryDTO): Promise<PaginatedResponse<AuditLog>> {
    const { page, limit } = query;
    const where = this.buildAuditLogWhere(query);

    const [auditLogs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: auditLogs,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  private buildAuditLogWhere(query: GetAllAuditLogsQueryDTO): Prisma.AuditLogWhereInput {
    const filters: Prisma.AuditLogWhereInput[] = [];

    if (query.entityType) filters.push({ entityType: query.entityType });
    if (query.entityId) filters.push({ entityId: query.entityId });
    if (query.actorId) filters.push({ actorId: query.actorId });
    if (query.action) filters.push({ action: query.action });

    return filters.length > 0 ? { AND: filters } : {};
  }
}
