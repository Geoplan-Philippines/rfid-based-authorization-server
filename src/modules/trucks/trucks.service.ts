import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Truck, TruckDriverAssignmentStatus } from '@prisma/client';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TRUCK_AUDIT_ACTION, TRUCK_DETAIL_INCLUDE, TRUCK_ENTITY_TYPE, TRUCK_LIST_INCLUDE, TRUCK_WITH_DRIVERS_INCLUDE, TruckAuditAction, UNTAGGED_TRUCK_SELECT } from './constants/trucks.constants';
import { CreateTruckDTO } from './dto/create-truck.dto';
import { GetAllTrucksQueryDTO } from './dto/get-all-trucks-query.dto';
import { UpdateTruckDTO } from './dto/update-truck.dto';
import { mapTruckToDetail, mapTruckToListItem } from './trucks.mapper';
import type { TruckDetail, TruckListResponse, TruckUntaggedItem, TruckWithDrivers } from './types/trucks.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TrucksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateEventAnalyticsService: GateEventAnalyticsService,
    private readonly imageUploadService: ImageUploadService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createTruck(body: CreateTruckDTO, actorId?: string): Promise<Truck> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const truck = await tx.truck.create({ data: this.buildTruckCreateData(body) });

        await this.recordTruckAuditLog(tx, {
          actorId,
          action: TRUCK_AUDIT_ACTION.create,
          entityId: truck.id,
          metadata: { plateNumber: truck.plateNumber },
        });

        return truck;
      });
    } catch (error) {
      this.throwTruckConflict(error);
      throw error;
    }
  }

  async getAllTrucks(query: GetAllTrucksQueryDTO): Promise<TruckListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);

    const [trucks, total, withNoDriver] = await Promise.all([
      this.prisma.truck.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: TRUCK_LIST_INCLUDE,
      }),
      this.prisma.truck.count({ where }),
      this.prisma.truck.count({
        where: {
          AND: [
            where,
            { driverAssignments: { none: { status: TruckDriverAssignmentStatus.ACTIVE } } },
          ],
        },
      }),
    ]);

    const summaries = await this.gateEventAnalyticsService.getTruckGateEventSummaries(
      trucks.map((truck) => truck.id),
    );

    return {
      data: trucks.map((truck) => mapTruckToListItem(truck, summaries[truck.id])),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        counts: { withNoDriver },
      },
    };
  }

  async getAllTrucksWithDrivers(): Promise<TruckWithDrivers[]> {
    return this.prisma.truck.findMany({
      orderBy: { createdAt: 'desc' },
      include: TRUCK_WITH_DRIVERS_INCLUDE,
    });
  }

  async getUntaggedTrucks(): Promise<TruckUntaggedItem[]> {
    return this.prisma.truck.findMany({
      where: { isArchived: false, rfidTag: { is: null } },
      orderBy: { plateNumber: 'asc' },
      select: UNTAGGED_TRUCK_SELECT,
    });
  }

  async findTruckById(id: string): Promise<Truck | null> {
    return this.prisma.truck.findUnique({ where: { id } });
  }

  async getTruckById(id: string): Promise<TruckDetail> {
    const truck = await this.prisma.truck.findUnique({
      where: { id },
      include: TRUCK_DETAIL_INCLUDE,
    });

    if (!truck) throw new NotFoundException('Truck not found');

    const [summaries, recentGateEvents] = await Promise.all([
      this.gateEventAnalyticsService.getTruckGateEventSummaries([truck.id]),
      this.gateEventAnalyticsService.getRecentTruckGateEvents(truck.id),
    ]);

    return mapTruckToDetail(truck, summaries[truck.id], recentGateEvents);
  }

  async updateTruck(id: string, body: UpdateTruckDTO, actorId?: string): Promise<Truck> {
    const data = this.buildTruckUpdateData(body);
    if (Object.keys(data).length === 0) throw new BadRequestException('At least one truck field is required');

    await this.ensureTruckExists(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const truck = await tx.truck.update({ where: { id }, data });

        await this.recordTruckAuditLog(tx, {
          actorId,
          action: TRUCK_AUDIT_ACTION.update,
          entityId: truck.id,
          metadata: { fields: Object.keys(data) },
        });

        return truck;
      });
    } catch (error) {
      this.throwTruckConflict(error);
      throw error;
    }
  }

  async archiveTruck(id: string, actorId?: string): Promise<Truck> {
    return this.updateTruckArchivedState(id, true, TRUCK_AUDIT_ACTION.archive, actorId);
  }

  async restoreTruck(id: string, actorId?: string): Promise<Truck> {
    return this.updateTruckArchivedState(id, false, TRUCK_AUDIT_ACTION.restore, actorId);
  }

  async saveTruckPhoto(id: string, file: Express.Multer.File | undefined, actorId?: string): Promise<Truck> {
    await this.ensureTruckExists(id);
    const photoUrl = await this.imageUploadService.saveRegistryPhoto(file, 'trucks');

    return this.prisma.$transaction(async (tx) => {
      const truck = await tx.truck.update({ where: { id }, data: { photoUrl } });

      await this.recordTruckAuditLog(tx, {
        actorId,
        action: TRUCK_AUDIT_ACTION.uploadPhoto,
        entityId: truck.id,
        metadata: { photoUrl },
      });

      return truck;
    });
  }

  private async updateTruckArchivedState(
    id: string,
    isArchived: boolean,
    action: TruckAuditAction,
    actorId?: string,
  ): Promise<Truck> {
    await this.ensureTruckExists(id);

    return this.prisma.$transaction(async (tx) => {
      const truck = await tx.truck.update({ where: { id }, data: { isArchived } });

      await this.recordTruckAuditLog(tx, {
        actorId,
        action,
        entityId: truck.id,
      });

      return truck;
    });
  }

  private buildListWhere(query: GetAllTrucksQueryDTO): Prisma.TruckWhereInput {
    const filters: Prisma.TruckWhereInput[] = [];
    const search = query.search?.trim();

    if (!query.includeArchived) filters.push({ isArchived: false });

    if (search) {
      const searchableFields: Prisma.TruckWhereInput[] = [
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ];

      if (UUID_PATTERN.test(search)) searchableFields.unshift({ id: search });

      filters.push({ OR: searchableFields });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private buildTruckCreateData(body: CreateTruckDTO): Prisma.TruckCreateInput {
    return {
      plateNumber: this.normalizePlateNumber(body.plateNumber),
      model: body.model.trim(),
    };
  }

  private buildTruckUpdateData(body: UpdateTruckDTO): Prisma.TruckUpdateInput {
    const data: Prisma.TruckUpdateInput = {};

    if (body.plateNumber !== undefined) data.plateNumber = this.normalizePlateNumber(body.plateNumber);
    if (body.model !== undefined) data.model = body.model.trim();

    return data;
  }

  private async ensureTruckExists(id: string): Promise<void> {
    const truck = await this.prisma.truck.findUnique({ where: { id }, select: { id: true } });
    if (!truck) throw new NotFoundException('Truck not found');
  }

  private async recordTruckAuditLog(
    tx: Prisma.TransactionClient,
    input: { actorId?: string; action: TruckAuditAction; entityId: string; metadata?: Prisma.InputJsonValue },
  ): Promise<void> {
    await this.auditLogsService.recordAuditLog({
      actorId: input.actorId,
      action: input.action,
      entityType: TRUCK_ENTITY_TYPE,
      entityId: input.entityId,
      metadata: input.metadata,
    }, tx);
  }

  private throwTruckConflict(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return;

    throw new ConflictException('Truck with the same plate number already exists');
  }

  private normalizePlateNumber(value: string): string {
    return value.trim().toUpperCase();
  }
}
