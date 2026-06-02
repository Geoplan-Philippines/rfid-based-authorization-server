import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateDriverDTO } from './dto/create-driver.dto';
import { GetAllDriversQueryDTO } from './dto/get-all-drivers-query.dto';
import { DriverWithRelations } from './types/drivers.types';
import { Driver, Prisma } from '@prisma/client';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async createDriver(createDriverDTO: CreateDriverDTO): Promise<Driver> {
    try {
      return await this.prisma.driver.create({
        data: {
          firstName: this.toTitleCase(createDriverDTO.firstName),
          lastName: this.toTitleCase(createDriverDTO.lastName),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Driver with the same name already exists');
      }
      throw error;
    }
  }

  async getAllDrivers(query: GetAllDriversQueryDTO): Promise<PaginatedResponse<Driver>> {
    const { page, limit } = query;

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.driver.count(),
    ]);

    return {
      data: drivers,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getAllDriversWithTrucks(): Promise<DriverWithRelations[]> {
    return this.prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        truckAssignments: {
          include: { truck: true },
        },
      },
    });
  }

  async findDriverById(id: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  private toTitleCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
