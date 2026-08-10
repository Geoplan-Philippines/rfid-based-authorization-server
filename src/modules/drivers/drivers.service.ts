import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Driver, Prisma, TruckDriverAssignmentStatus } from '@prisma/client';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateDriverDTO } from './dto/create-driver.dto';
import { GetAllDriversQueryDTO } from './dto/get-all-drivers-query.dto';
import { UpdateDriverDTO } from './dto/update-driver.dto';
import {
  DriverDetail,
  DriverListItem,
  DriverListResponse,
  DriverWithTrucks,
  driverWithTrucksInclude,
} from './types/drivers.types';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateEventAnalyticsService: GateEventAnalyticsService,
    private readonly imageUploadService: ImageUploadService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createDriver(body: CreateDriverDTO, actorId?: string): Promise<Driver> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driver.create({
          data: {
            firstName: this.toTitleCase(body.firstName),
            lastName: this.toTitleCase(body.lastName),
            licenseNumber: this.normalizeLicenseNumber(body.licenseNumber),
          },
        });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'CREATE_DRIVER',
          entityType: 'Driver',
          entityId: driver.id,
          metadata: { licenseNumber: driver.licenseNumber },
        }, tx);

        return driver;
      });
    } catch (error) {
      this.throwDriverConflict(error);
      throw error;
    }
  }

  async getAllDrivers(query: GetAllDriversQueryDTO): Promise<DriverListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          truckAssignments: {
            where: { status: TruckDriverAssignmentStatus.ACTIVE },
            orderBy: { createdAt: 'desc' },
            include: { truck: { select: { id: true, plateNumber: true } } },
          },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);

    const summaries = await this.gateEventAnalyticsService.getDriverGateEventSummaries(
      drivers.map((driver) => driver.id),
    );

    return {
      data: drivers.map((driver): DriverListItem => {
        const summary = summaries[driver.id];

        return {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          licenseNumber: driver.licenseNumber,
          photoUrl: driver.photoUrl,
          isArchived: driver.isArchived,
          trucksCount: driver.truckAssignments.length,
          trucks: driver.truckAssignments.slice(0, 3).map((assignment) => ({
            id: assignment.truck.id,
            plateNumber: assignment.truck.plateNumber,
          })),
          events30d: summary.events30d,
          lastEventAt: summary.lastEventAt,
          createdAt: driver.createdAt,
        };
      }),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getAllDriversWithTrucks(): Promise<DriverWithTrucks[]> {
    return this.prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: driverWithTrucksInclude,
    });
  }

  async findDriverById(id: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  async getDriverById(id: string): Promise<DriverDetail> {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        truckAssignments: {
          where: { status: TruckDriverAssignmentStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
          include: {
            truck: {
              include: { rfidTag: true },
            },
          },
        },
      },
    });

    if (!driver) throw new NotFoundException('Driver not found');

    const [summaries, recentGateEvents] = await Promise.all([
      this.gateEventAnalyticsService.getDriverGateEventSummaries([driver.id]),
      this.gateEventAnalyticsService.getRecentDriverGateEvents(driver.id),
    ]);
    const summary = summaries[driver.id];

    return {
      id: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      licenseNumber: driver.licenseNumber,
      photoUrl: driver.photoUrl,
      isArchived: driver.isArchived,
      trucks: driver.truckAssignments.map((assignment) => ({
        id: assignment.truck.id,
        plateNumber: assignment.truck.plateNumber,
        model: assignment.truck.model,
        role: assignment.role,
        since: assignment.createdAt,
        tagEpc: assignment.truck.rfidTag?.epcId ?? null,
        tagStatus: assignment.truck.rfidTag?.status ?? null,
      })),
      events30d: summary.events30d,
      denials30d: summary.denials30d,
      lastEventAt: summary.lastEventAt,
      lastResult: summary.lastResult,
      createdAt: driver.createdAt,
      recentGateEvents,
    };
  }

  async getDriverWithTrucksById(id: string): Promise<DriverWithTrucks | null> {
    return this.prisma.driver.findUnique({
      where: { id },
      include: driverWithTrucksInclude,
    });
  }

  async updateDriver(id: string, body: UpdateDriverDTO, actorId?: string): Promise<Driver> {
    const data = this.buildDriverUpdateData(body);
    if (Object.keys(data).length === 0) throw new BadRequestException('At least one driver field is required');

    await this.ensureDriverExists(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driver.update({ where: { id }, data });

        await this.auditLogsService.recordAuditLog({
          actorId,
          action: 'UPDATE_DRIVER',
          entityType: 'Driver',
          entityId: driver.id,
          metadata: { fields: Object.keys(data) },
        }, tx);

        return driver;
      });
    } catch (error) {
      this.throwDriverConflict(error);
      throw error;
    }
  }

  async archiveDriver(id: string, actorId?: string): Promise<Driver> {
    await this.ensureDriverExists(id);

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.update({ where: { id }, data: { isArchived: true } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'ARCHIVE_DRIVER',
        entityType: 'Driver',
        entityId: driver.id,
      }, tx);

      return driver;
    });
  }

  async restoreDriver(id: string, actorId?: string): Promise<Driver> {
    await this.ensureDriverExists(id);

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.update({ where: { id }, data: { isArchived: false } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'RESTORE_DRIVER',
        entityType: 'Driver',
        entityId: driver.id,
      }, tx);

      return driver;
    });
  }

  async saveDriverPhoto(id: string, file: Express.Multer.File | undefined, actorId?: string): Promise<Driver> {
    await this.ensureDriverExists(id);
    const photoUrl = await this.imageUploadService.saveRegistryPhoto(file, 'drivers');

    return this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.update({ where: { id }, data: { photoUrl } });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPLOAD_DRIVER_PHOTO',
        entityType: 'Driver',
        entityId: driver.id,
        metadata: { photoUrl },
      }, tx);

      return driver;
    });
  }

  private buildListWhere(query: GetAllDriversQueryDTO): Prisma.DriverWhereInput {
    const filters: Prisma.DriverWhereInput[] = [];
    const search = query.search?.trim();

    if (!query.includeArchived) filters.push({ isArchived: false });

    if (search) {
      filters.push({
        OR: [
          { id: search },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { licenseNumber: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private buildDriverUpdateData(body: UpdateDriverDTO): Prisma.DriverUpdateInput {
    const data: Prisma.DriverUpdateInput = {};

    if (body.firstName !== undefined) data.firstName = this.toTitleCase(body.firstName);
    if (body.lastName !== undefined) data.lastName = this.toTitleCase(body.lastName);
    if (body.licenseNumber !== undefined) data.licenseNumber = this.normalizeLicenseNumber(body.licenseNumber);

    return data;
  }

  private async ensureDriverExists(id: string): Promise<void> {
    const driver = await this.prisma.driver.findUnique({ where: { id }, select: { id: true } });
    if (!driver) throw new NotFoundException('Driver not found');
  }

  private throwDriverConflict(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return;

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : '';
    if (target.includes('license_number')) {
      throw new ConflictException('Driver with the same license number already exists');
    }

    // Generic fallback for any other unique constraint (license_number is the only one asserted
    // above; firstName+lastName is deliberately NOT unique — 2 000+ drivers guarantees name
    // collisions, see D9).
    throw new ConflictException(target ? `Driver conflicts on unique field: ${target}` : 'Driver already exists');
  }

  private normalizeLicenseNumber(value: string): string {
    return value.trim().toUpperCase();
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
