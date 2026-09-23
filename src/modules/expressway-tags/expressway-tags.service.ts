import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ExpresswayTagStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateExpresswayTagDto } from './dto/create-expressway-tag.dto';
import { GetAllExpresswayTagsQueryDTO } from './dto/get-all-expressway-tags-query.dto';
import { UpdateExpresswayTagDto } from './dto/update-expressway-tag.dto';
import { UpdateExpresswayTagStatusDto } from './dto/update-expressway-tag-status.dto';
import {
  ExpresswayAssignedTruckSummary,
  ExpresswayTagDetail,
  ExpresswayTagListItem,
  ExpresswayTagListResponse,
  ExpresswayTagStatusCounts,
  ExpresswayTagWithTruck,
  expresswayTagWithTruckInclude,
} from './types/expressway-tags.types';

@Injectable()
export class ExpresswayTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createExpresswayTag(body: CreateExpresswayTagDto, actorId?: string): Promise<ExpresswayTagWithTruck> {
    if (body.truckId) {
      const truck = await this.prisma.truck.findUnique({ where: { id: body.truckId } });
      if (!truck) throw new NotFoundException('Truck not found');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const expresswayTag = await tx.expresswayTag.create({
          data: body,
          include: expresswayTagWithTruckInclude,
        });

        await tx.expresswayTagStatusHistory.create({
          data: {
            expresswayTagId: expresswayTag.id,
            fromStatus: null,
            toStatus: expresswayTag.status,
            changedById: actorId ?? null,
            reason: 'Tag created',
          },
        });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'CREATE_EXPRESSWAY_TAG',
          entityType: 'ExpresswayTag',
          entityId: expresswayTag.id,
          metadata: { epcId: expresswayTag.epcId, truckId: expresswayTag.truckId },
        }, tx);

        return expresswayTag;
      });
    } catch (error) {
      this.throwConflict(error);
      throw error;
    }
  }

  async getAllExpresswayTags(query: GetAllExpresswayTagsQueryDTO): Promise<ExpresswayTagListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);
    const countsWhere = this.buildListWhere(query, { includeStatus: false });

    const [expresswayTags, total, counts] = await Promise.all([
      this.prisma.expresswayTag.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: expresswayTagWithTruckInclude,
      }),
      this.prisma.expresswayTag.count({ where }),
      this.getStatusCounts(countsWhere),
    ]);

    return {
      data: expresswayTags.map((tag): ExpresswayTagListItem => {
        return {
          id: tag.id,
          epcId: tag.epcId,
          label: tag.label,
          status: tag.status,
          truck: this.mapAssignedTruck(tag.truck),
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        };
      }),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        counts,
      },
    };
  }

  async findByEpcId(epcId: string): Promise<ExpresswayTagWithTruck | null> {
    return this.prisma.expresswayTag.findUnique({
      where: { epcId },
      include: expresswayTagWithTruckInclude,
    });
  }

  async getExpresswayTagById(id: string): Promise<ExpresswayTagDetail> {
    const tag = await this.prisma.expresswayTag.findUnique({
      where: { id },
      include: {
        truck: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!tag) throw new NotFoundException('Expressway tag not found');

    return {
      id: tag.id,
      epcId: tag.epcId,
      label: tag.label,
      status: tag.status,
      truck: this.mapAssignedTruck(tag.truck),
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      statusHistory: tag.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
    };
  }

  async updateExpresswayTag(id: string, body: UpdateExpresswayTagDto, actorId?: string): Promise<ExpresswayTagDetail> {
    const existing = await this.prisma.expresswayTag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expressway tag not found');

    if (body.truckId) {
      const truck = await this.prisma.truck.findUnique({ where: { id: body.truckId } });
      if (!truck) throw new NotFoundException('Truck not found');
    }

    await this.prisma.$transaction(async (tx) => {
      const updatedTag = await tx.expresswayTag.update({
        where: { id },
        data: body,
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPDATE_EXPRESSWAY_TAG',
        entityType: 'ExpresswayTag',
        entityId: updatedTag.id,
        metadata: {
          previousTruckId: existing.truckId,
          truckId: updatedTag.truckId,
          previousLabel: existing.label,
          label: updatedTag.label,
        },
      }, tx);
    });

    return this.getExpresswayTagById(id);
  }

  async updateExpresswayTagStatus(
    id: string,
    body: UpdateExpresswayTagStatusDto,
    actorId?: string,
  ): Promise<ExpresswayTagDetail> {
    const existing = await this.prisma.expresswayTag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expressway tag not found');
    if (existing.status === body.status) throw new BadRequestException('Expressway tag already has this status');

    await this.prisma.$transaction(async (tx) => {
      const updatedTag = await tx.expresswayTag.update({
        where: { id },
        data: { status: body.status },
      });

      await tx.expresswayTagStatusHistory.create({
        data: {
          expresswayTagId: updatedTag.id,
          fromStatus: existing.status,
          toStatus: updatedTag.status,
          reason: body.reason?.trim() || null,
          changedById: actorId ?? null,
        },
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPDATE_EXPRESSWAY_TAG_STATUS',
        entityType: 'ExpresswayTag',
        entityId: updatedTag.id,
        metadata: {
          fromStatus: existing.status,
          toStatus: updatedTag.status,
          reason: body.reason ?? null,
        },
      }, tx);
    });

    return this.getExpresswayTagById(id);
  }

  private mapAssignedTruck(truck: ExpresswayTagWithTruck['truck']): ExpresswayAssignedTruckSummary | null {
    if (!truck) return null;

    return {
      id: truck.id,
      plateNumber: truck.plateNumber,
      model: truck.model,
    };
  }

  private buildListWhere(
    query: GetAllExpresswayTagsQueryDTO,
    options: { includeStatus?: boolean } = {},
  ): Prisma.ExpresswayTagWhereInput {
    const includeStatus = options.includeStatus ?? true;
    const filters: Prisma.ExpresswayTagWhereInput[] = [];
    const search = query.search?.trim();

    if (search) {
      filters.push({
        OR: [
          { epcId: { contains: search, mode: 'insensitive' } },
          { label: { contains: search, mode: 'insensitive' } },
          { truck: { is: { plateNumber: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    if (includeStatus && query.status) filters.push({ status: query.status });

    return filters.length > 0 ? { AND: filters } : {};
  }

  private async getStatusCounts(where: Prisma.ExpresswayTagWhereInput): Promise<ExpresswayTagStatusCounts> {
    const groupedCounts = await this.prisma.expresswayTag.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counts = Object.values(ExpresswayTagStatus).reduce<ExpresswayTagStatusCounts>((acc, status) => {
      acc[status] = 0;
      return acc;
    }, { total: 0 } as ExpresswayTagStatusCounts);

    for (const group of groupedCounts) {
      counts[group.status] = group._count._all;
      counts.total += group._count._all;
    }

    return counts;
  }

  private throwConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Expressway tag already exists for this EPC');
    }
  }
}
