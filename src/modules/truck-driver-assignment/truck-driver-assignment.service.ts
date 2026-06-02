import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, TruckDriverAssignmentStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateAssignmentDTO } from './dto/create-assignment.dto';
import { GetAllAssignmentsQueryDTO } from './dto/get-all-assignments-query.dto';
import { UpdateAssignmentStatusDTO } from './dto/update-assignment-status.dto';
import { TruckDriverAssignmentWithRelations } from './types/truck-driver-assignment.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

const ASSIGNMENT_INCLUDE = {
  truck: true,
  driver: true,
} satisfies Prisma.TruckDriverAssignmentInclude;

@Injectable()
export class TruckDriverAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssignment(createAssignmentDTO: CreateAssignmentDTO): Promise<TruckDriverAssignmentWithRelations> {
    const { truckId, driverId } = createAssignmentDTO;

    const [truck, driver] = await Promise.all([
      this.prisma.truck.findUnique({ where: { id: truckId } }),
      this.prisma.driver.findUnique({ where: { id: driverId } }),
    ]);
    if (!truck) throw new NotFoundException('Truck not found');
    if (!driver) throw new NotFoundException('Driver not found');

    return this.prisma.truckDriverAssignment.upsert({
      where: { truckId_driverId: { truckId, driverId } },
      create: { truckId, driverId },
      update: { status: TruckDriverAssignmentStatus.ACTIVE },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async getAllAssignments(
    query: GetAllAssignmentsQueryDTO,
  ): Promise<PaginatedResponse<TruckDriverAssignmentWithRelations>> {
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

  async updateAssignmentStatus(updateAssignmentStatusDTO: UpdateAssignmentStatusDTO): Promise<TruckDriverAssignmentWithRelations> {
    const { truckId, driverId, status } = updateAssignmentStatusDTO;
    await this.ensureAssignmentExists(truckId, driverId);

    return this.prisma.truckDriverAssignment.update({
      where: { truckId_driverId: { truckId, driverId } },
      data: { status },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  private async ensureAssignmentExists(truckId: string, driverId: string): Promise<void> {
    const assignment = await this.prisma.truckDriverAssignment.findUnique({
      where: { truckId_driverId: { truckId, driverId } },
    });
    if (!assignment) throw new NotFoundException('Truck-driver assignment not found');
  }
}
