import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Truck } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateTruckDTO } from './dto/create-truck.dto';
import { GetAllTrucksQueryDTO } from './dto/get-all-trucks-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class TrucksService {
  constructor(private readonly prisma: PrismaService) {}

  async createTruck(createTruckDTO: CreateTruckDTO): Promise<Truck> {
    const existing = await this.prisma.truck.findUnique({
      where: { plateNumber: createTruckDTO.plateNumber.trim().toUpperCase() },
    });

    if (existing) throw new ConflictException('Truck with the same plate number already exists');

    if (createTruckDTO.assignedDriverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: createTruckDTO.assignedDriverId },
      });
      if (!driver) throw new NotFoundException('Assigned driver not found');
    }

    return this.prisma.truck.create({
      data: {
        ...createTruckDTO,
        plateNumber: createTruckDTO.plateNumber.trim().toUpperCase(),
      },
    });
  }

  async getAllTrucks(query: GetAllTrucksQueryDTO): Promise<PaginatedResponse<Truck>> {
    const { page, limit } = query;

    const [trucks, total] = await Promise.all([
      this.prisma.truck.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.truck.count(),
    ]);

    return {
      data: trucks,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findTruckById(id: string): Promise<Truck | null> {
    return this.prisma.truck.findUnique({ where: { id } });
  }
}