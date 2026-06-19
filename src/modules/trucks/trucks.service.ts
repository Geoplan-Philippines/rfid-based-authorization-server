import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Truck, TruckDriverAssignmentStatus } from '@prisma/client';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateTruckDTO } from './dto/create-truck.dto';
import { GetAllTrucksQueryDTO } from './dto/get-all-trucks-query.dto';
import { UpdateTruckDTO } from './dto/update-truck.dto';
import { TruckDetail, TruckListItem, TruckListResponse, TruckWithDrivers, truckWithDriversInclude } from './types/trucks.types';

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
        const truck = await tx.truck.create({
          data: {
            plateNumber: this.normalizePlateNumber(body.plateNumber),
            model: body.model.trim(),
          },
        });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'CREATE_TRUCK',
          entityType: 'Truck',
          entityId: truck.id,
          metadata: { plateNumber: truck.plateNumber },
        }, tx);

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
        include: {
          rfidTag: true,
          driverAssignments: {
            where: { status: TruckDriverAssignmentStatus.ACTIVE },
            orderBy: { createdAt: 'desc' },
            include: { driver: true },
          },
        },
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
      data: trucks.map((truck): TruckListItem => {
        const summary = summaries[truck.id];

        return {
          id: truck.id,
          plateNumber: truck.plateNumber,
          model: truck.model,
          photoUrl: truck.photoUrl,
          isArchived: truck.isArchived,
          drivers: truck.driverAssignments.map((assignment) => ({
            id: assignment.driver.id,
            name: this.formatDriverName(assignment.driver.firstName, assignment.driver.lastName),
            role: assignment.role,
          })),
          driversCount: truck.driverAssignments.length,
          boundTag: truck.rfidTag ? { epcId: truck.rfidTag.epcId, status: truck.rfidTag.status } : null,
          events30d: summary.events30d,
          lastEventAt: summary.lastEventAt,
        };
      }),
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
      include: truckWithDriversInclude,
    });
  }

  async findTruckById(id: string): Promise<Truck | null> {
    return this.prisma.truck.findUnique({ where: { id } });
  }

  async getTruckById(id: string): Promise<TruckDetail> {
    const truck = await this.prisma.truck.findUnique({
      where: { id },
      include: {
        rfidTag: true,
        driverAssignments: {
          where: { status: TruckDriverAssignmentStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
          include: { driver: true },
        },
      },
    });

    if (!truck) throw new NotFoundException('Truck not found');

    const [summaries, recentGateEvents] = await Promise.all([
      this.gateEventAnalyticsService.getTruckGateEventSummaries([truck.id]),
      this.gateEventAnalyticsService.getRecentTruckGateEvents(truck.id),
    ]);
    const summary = summaries[truck.id];

    return {
      id: truck.id,
      plateNumber: truck.plateNumber,
      model: truck.model,
      photoUrl: truck.photoUrl,
      isArchived: truck.isArchived,
      status: truck.isArchived ? 'ARCHIVED' : 'ACTIVE',
      drivers: truck.driverAssignments.map((assignment) => ({
        id: assignment.driver.id,
        name: this.formatDriverName(assignment.driver.firstName, assignment.driver.lastName),
        licenseNumber: assignment.driver.licenseNumber,
        role: assignment.role,
        since: assignment.createdAt,
        photoUrl: assignment.driver.photoUrl,
      })),
      boundTag: truck.rfidTag ? { epcId: truck.rfidTag.epcId, status: truck.rfidTag.status } : null,
      events30d: summary.events30d,
      lastEventAt: summary.lastEventAt,
      lastResult: summary.lastResult,
      recentGateEvents,
      createdAt: truck.createdAt,
    };
  }

  async updateTruck(id: string, body: UpdateTruckDTO, actorId?: string): Promise<Truck> {
    const data = this.buildTruckUpdateData(body);
    if (Object.keys(data).length === 0) throw new BadRequestException('At least one truck field is required');

    await this.ensureTruckExists(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const truck = await tx.truck.update({ where: { id }, data });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'UPDATE_TRUCK',
          entityType: 'Truck',
          entityId: truck.id,
          metadata: { fields: Object.keys(data) },
        }, tx);

        return truck;
      });
    } catch (error) {
      this.throwTruckConflict(error);
      throw error;
    }
  }

  async archiveTruck(id: string, actorId?: string): Promise<Truck> {
    await this.ensureTruckExists(id);

    return this.prisma.$transaction(async (tx) => {
      const truck = await tx.truck.update({ where: { id }, data: { isArchived: true } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'ARCHIVE_TRUCK',
        entityType: 'Truck',
        entityId: truck.id,
      }, tx);

      return truck;
    });
  }

  async restoreTruck(id: string, actorId?: string): Promise<Truck> {
    await this.ensureTruckExists(id);

    return this.prisma.$transaction(async (tx) => {
      const truck = await tx.truck.update({ where: { id }, data: { isArchived: false } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'RESTORE_TRUCK',
        entityType: 'Truck',
        entityId: truck.id,
      }, tx);

      return truck;
    });
  }

  async saveTruckPhoto(id: string, file: Express.Multer.File | undefined, actorId?: string): Promise<Truck> {
    await this.ensureTruckExists(id);
    const photoUrl = await this.imageUploadService.saveRegistryPhoto(file, 'trucks');

    return this.prisma.$transaction(async (tx) => {
      const truck = await tx.truck.update({ where: { id }, data: { photoUrl } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPLOAD_TRUCK_PHOTO',
        entityType: 'Truck',
        entityId: truck.id,
        metadata: { photoUrl },
      }, tx);

      return truck;
    });
  }

  private buildListWhere(query: GetAllTrucksQueryDTO): Prisma.TruckWhereInput {
    const filters: Prisma.TruckWhereInput[] = [];
    const search = query.search?.trim();

    if (!query.includeArchived) filters.push({ isArchived: false });

    if (search) {
      filters.push({
        OR: [
          { id: search },
          { plateNumber: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
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

  private throwTruckConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Truck with the same plate number already exists');
    }
  }

  private normalizePlateNumber(value: string): string {
    return value.trim().toUpperCase();
  }

  private formatDriverName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`;
  }
}
