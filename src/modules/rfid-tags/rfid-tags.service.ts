import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RFIDTagStatus } from '@prisma/client';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateRfidTagDTO } from './dto/create-rfid-tag.dto';
import { GetAllRfidTagsQueryDTO } from './dto/get-all-rfid-tags-query.dto';
import { RebindRfidTagDTO } from './dto/rebind-rfid-tag.dto';
import { UpdateRfidTagStatusDTO } from './dto/update-rfid-tag-status.dto';
import {
  RfidAssignedTruckSummary,
  RfidTagDetail,
  RfidTagListItem,
  RfidTagListResponse,
  RfidTagStatusCounts,
  RfidTagWithTruck,
  rfidTagWithTruckInclude,
} from './types/rfid-tags.types';

@Injectable()
export class RfidTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateEventAnalyticsService: GateEventAnalyticsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createRfidTag(body: CreateRfidTagDTO, actorId?: string): Promise<RfidTagWithTruck> {
    // An omitted truck registers the tag as unbound spare stock, so only validate when one is given.
    if (body.assignedTruckId) {
      const truck = await this.prisma.truck.findUnique({ where: { id: body.assignedTruckId } });
      if (!truck) throw new NotFoundException('Truck not found');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rfidTag = await tx.rFIDTag.create({
          data: body,
          include: rfidTagWithTruckInclude,
        });

        await tx.rFIDTagStatusHistory.create({
          data: {
            rfidTagId: rfidTag.id,
            fromStatus: null,
            toStatus: rfidTag.status,
            changedById: actorId ?? null,
            reason: 'Tag created',
          },
        });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'CREATE_RFID_TAG',
          entityType: 'RFIDTag',
          entityId: rfidTag.id,
          metadata: { epcId: rfidTag.epcId, assignedTruckId: rfidTag.assignedTruckId },
        }, tx);

        return rfidTag;
      });
    } catch (error) {
      this.throwRfidTagConflict(error);
      throw error;
    }
  }

  async getAllRfidTags(query: GetAllRfidTagsQueryDTO): Promise<RfidTagListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);
    const countsWhere = this.buildListWhere(query, { includeStatus: false });

    const [rfidTags, total, counts] = await Promise.all([
      this.prisma.rFIDTag.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: rfidTagWithTruckInclude,
      }),
      this.prisma.rFIDTag.count({ where }),
      this.getStatusCounts(countsWhere),
    ]);

    const summaries = await this.gateEventAnalyticsService.getRfidTagGateEventSummaries(
      rfidTags.map((rfidTag) => rfidTag.id),
    );

    return {
      data: rfidTags.map((rfidTag): RfidTagListItem => {
        const summary = summaries[rfidTag.id];

        return {
          id: rfidTag.id,
          epcId: rfidTag.epcId,
          serialNo: rfidTag.serialNo,
          status: rfidTag.status,
          assignedTruck: this.mapAssignedTruck(rfidTag.assignedTruck),
          lastSeenAt: summary.lastEventAt,
          lastResult: summary.lastResult,
          events30d: summary.events30d,
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

  async findRfidTagById(id: string): Promise<RfidTagWithTruck | null> {
    return this.prisma.rFIDTag.findUnique({
      where: { id },
      include: rfidTagWithTruckInclude,
    });
  }

  async getRfidTagById(id: string): Promise<RfidTagDetail> {
    const rfidTag = await this.prisma.rFIDTag.findUnique({
      where: { id },
      include: {
        assignedTruck: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!rfidTag) throw new NotFoundException('RFID tag not found');

    const [summaries, lastVerification] = await Promise.all([
      this.gateEventAnalyticsService.getRfidTagGateEventSummaries([rfidTag.id]),
      this.prisma.eventVerification.findFirst({
        where: { gateEvent: { rfidTagId: rfidTag.id } },
        orderBy: { verifiedAt: 'desc' },
        select: { verifiedAt: true },
      }),
    ]);
    const summary = summaries[rfidTag.id];

    return {
      id: rfidTag.id,
      epcId: rfidTag.epcId,
      serialNo: rfidTag.serialNo,
      status: rfidTag.status,
      assignedTruck: this.mapAssignedTruck(rfidTag.assignedTruck),
      lastSeenAt: summary.lastEventAt,
      lastResult: summary.lastResult,
      events30d: summary.events30d,
      boundSince: rfidTag.createdAt,
      lastVerifiedAt: lastVerification?.verifiedAt ?? null,
      denials7d: summary.denials7d,
      statusHistory: rfidTag.statusHistory.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
    };
  }

  async updateRfidTagStatus(
    id: string,
    body: UpdateRfidTagStatusDTO,
    actorId?: string,
  ): Promise<RfidTagDetail> {
    const existing = await this.prisma.rFIDTag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('RFID tag not found');
    if (existing.status === body.status) throw new BadRequestException('RFID tag already has this status');

    await this.prisma.$transaction(async (tx) => {
      const rfidTag = await tx.rFIDTag.update({
        where: { id },
        data: { status: body.status },
      });

      await tx.rFIDTagStatusHistory.create({
        data: {
          rfidTagId: rfidTag.id,
          fromStatus: existing.status,
          toStatus: rfidTag.status,
          reason: body.reason?.trim() || null,
          changedById: actorId ?? null,
        },
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPDATE_RFID_TAG_STATUS',
        entityType: 'RFIDTag',
        entityId: rfidTag.id,
        metadata: {
          fromStatus: existing.status,
          toStatus: rfidTag.status,
          reason: body.reason ?? null,
        },
      }, tx);
    });

    return this.getRfidTagById(id);
  }

  async rebindRfidTag(id: string, body: RebindRfidTagDTO, actorId?: string): Promise<RfidTagDetail> {
    const [rfidTag, truck, tagOnTargetTruck] = await Promise.all([
      this.prisma.rFIDTag.findUnique({ where: { id } }),
      this.prisma.truck.findUnique({ where: { id: body.assignedTruckId } }),
      this.prisma.rFIDTag.findUnique({ where: { assignedTruckId: body.assignedTruckId } }),
    ]);

    if (!rfidTag) throw new NotFoundException('RFID tag not found');
    if (!truck) throw new NotFoundException('Truck not found');
    if (tagOnTargetTruck && tagOnTargetTruck.id !== id) {
      throw new ConflictException('Target truck already has an RFID tag');
    }

    await this.prisma.$transaction(async (tx) => {
      const updatedRfidTag = await tx.rFIDTag.update({
        where: { id },
        data: { assignedTruckId: body.assignedTruckId },
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'REBIND_RFID_TAG',
        entityType: 'RFIDTag',
        entityId: updatedRfidTag.id,
        metadata: {
          previousTruckId: rfidTag.assignedTruckId,
          assignedTruckId: updatedRfidTag.assignedTruckId,
        },
      }, tx);
    });

    return this.getRfidTagById(id);
  }

  private mapAssignedTruck(truck: RfidTagWithTruck['assignedTruck']): RfidAssignedTruckSummary | null {
    if (!truck) return null;

    return {
      id: truck.id,
      plateNumber: truck.plateNumber,
      model: truck.model,
    };
  }

  private buildListWhere(
    query: GetAllRfidTagsQueryDTO,
    options: { includeStatus?: boolean } = {},
  ): Prisma.RFIDTagWhereInput {
    const includeStatus = options.includeStatus ?? true;
    const filters: Prisma.RFIDTagWhereInput[] = [];
    const search = query.search?.trim();

    if (search) {
      filters.push({
        OR: [
          { id: search },
          { epcId: { contains: search, mode: 'insensitive' } },
          { serialNo: { contains: search, mode: 'insensitive' } },
          { assignedTruck: { is: { plateNumber: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    if (includeStatus && query.status) filters.push({ status: query.status });

    return filters.length > 0 ? { AND: filters } : {};
  }

  private async getStatusCounts(where: Prisma.RFIDTagWhereInput): Promise<RfidTagStatusCounts> {
    const groupedCounts = await this.prisma.rFIDTag.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counts = Object.values(RFIDTagStatus).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, { total: 0 } as RfidTagStatusCounts);

    for (const group of groupedCounts) {
      counts[group.status] = group._count._all;
      counts.total += group._count._all;
    }

    return counts;
  }

  private throwRfidTagConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('RFID tag already exists for this EPC, serial number, or truck');
    }
  }
}
