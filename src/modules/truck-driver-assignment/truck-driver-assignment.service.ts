import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AssignmentRole, TruckDriverAssignmentStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateAssignmentDTO } from './dto/create-assignment.dto';
import { GetAllAssignmentsQueryDTO } from './dto/get-all-assignments-query.dto';
import { UpdateAssignmentStatusDTO } from './dto/update-assignment-status.dto';
import { TruckDriverAssignmentWithRelations } from './types/truck-driver-assignment.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ASSIGNMENT_INCLUDE } from './constants/assignment-include';

@Injectable()
export class TruckDriverAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createAssignment(
    body: CreateAssignmentDTO,
    actorId?: string,
  ): Promise<TruckDriverAssignmentWithRelations> {
    const { truckId, driverId } = body;
    const role = body.role ?? AssignmentRole.RELIEF;

    const [truck, driver] = await Promise.all([
      this.prisma.truck.findUnique({ where: { id: truckId } }),
      this.prisma.driver.findUnique({ where: { id: driverId } }),
    ]);
    if (!truck) throw new NotFoundException('Truck not found');
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.truckDriverAssignment.upsert({
        where: { truckId_driverId: { truckId, driverId } },
        create: { truckId, driverId, role },
        update: { status: TruckDriverAssignmentStatus.ACTIVE, role },
        include: ASSIGNMENT_INCLUDE,
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'ASSIGN_TRUCK_DRIVER',
        entityType: 'TruckDriverAssignment',
        entityId: `${truckId}:${driverId}`,
        metadata: { truckId, driverId, role },
      }, tx);

      return assignment;
    });
  }

  async getAllAssignments(query: GetAllAssignmentsQueryDTO): Promise<PaginatedResponse<TruckDriverAssignmentWithRelations>> {
    const { page, limit } = query;

    const [assignments, total] = await Promise.all([
      this.prisma.truckDriverAssignment.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ASSIGNMENT_INCLUDE,
      }),
      this.prisma.truckDriverAssignment.count(),
    ]);

    return {
      data: assignments,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async updateAssignmentStatus(
    truckId: string,
    driverId: string,
    body: UpdateAssignmentStatusDTO,
    actorId?: string,
  ): Promise<TruckDriverAssignmentWithRelations> {
    if (!body.status && !body.role) throw new BadRequestException('Status or role is required');
    await this.ensureAssignmentExists(truckId, driverId);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.truckDriverAssignment.update({
        where: { truckId_driverId: { truckId, driverId } },
        data: {
          status: body.status,
          role: body.role,
        },
        include: ASSIGNMENT_INCLUDE,
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UPDATE_TRUCK_DRIVER_ASSIGNMENT',
        entityType: 'TruckDriverAssignment',
        entityId: `${truckId}:${driverId}`,
        metadata: { truckId, driverId, status: body.status ?? null, role: body.role ?? null },
      }, tx);

      return assignment;
    });
  }

  async deleteAssignment(
    truckId: string,
    driverId: string,
    actorId?: string,
  ): Promise<TruckDriverAssignmentWithRelations> {
    await this.ensureAssignmentExists(truckId, driverId);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.truckDriverAssignment.delete({
        where: { truckId_driverId: { truckId, driverId } },
        include: ASSIGNMENT_INCLUDE,
      });

      await this.auditLogsService.recordAuditLog({
        actorId,
        action: 'UNASSIGN_TRUCK_DRIVER',
        entityType: 'TruckDriverAssignment',
        entityId: `${truckId}:${driverId}`,
        metadata: { truckId, driverId, role: assignment.role },
      }, tx);

      return assignment;
    });
  }

  private async ensureAssignmentExists(truckId: string, driverId: string): Promise<void> {
    const assignment = await this.prisma.truckDriverAssignment.findUnique({
      where: { truckId_driverId: { truckId, driverId } },
    });
    if (!assignment) throw new NotFoundException('Truck-driver assignment not found');
  }
}
