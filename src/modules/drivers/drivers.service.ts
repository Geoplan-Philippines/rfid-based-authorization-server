import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateDriverDTO } from './dto/create-driver.dto';
import { GetAllDriversQueryDTO } from './dto/get-all-drivers-query.dto';
import { Driver } from '@prisma/client';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async createDriver(createDriverDTO: CreateDriverDTO): Promise<Driver> {
    const existing = await this.prisma.driver.findFirst({
      where: {
        firstName: createDriverDTO.firstName.trim(),
        lastName: createDriverDTO.lastName.trim(),
      },
    });

    if (existing) throw new ConflictException('Driver with the same name already exists');

    return this.prisma.driver.create({
      data: {
        firstName: createDriverDTO.firstName.trim(),
        lastName: createDriverDTO.lastName.trim(),
      },
    });
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

  async findDriverById(id: string): Promise<Driver | null> {
    return this.prisma.driver.findUnique({ where: { id } });
  }
}