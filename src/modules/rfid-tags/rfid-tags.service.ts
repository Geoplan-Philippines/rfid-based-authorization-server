import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateRfidTagDTO } from './dto/create-rfid-tag.dto';
import { GetAllRfidTagsQueryDTO } from './dto/get-all-rfid-tags-query.dto';
import { RfidTagWithTruck } from './types/rfid-tags.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class RfidTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRfidTag(createRfidTagDTO: CreateRfidTagDTO): Promise<RfidTagWithTruck> {
    const truck = await this.prisma.truck.findUnique({ where: { id: createRfidTagDTO.assignedTruckId } });
    if (!truck) throw new NotFoundException('Truck not found');

    try {
      return await this.prisma.rFIDTag.create({
        data: createRfidTagDTO,
        include: { assignedTruck: true },
      });
    } catch (error) {
      // P2002 = unique constraint: either epcId is taken or the truck already has a tag.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('RFID tag already exists for this EPC or truck');
      }
      throw error;
    }
  }

  async getAllRfidTags(query: GetAllRfidTagsQueryDTO): Promise<PaginatedResponse<RfidTagWithTruck>> {
    const { page, limit } = query;

    const [rfidTags, total] = await Promise.all([
      this.prisma.rFIDTag.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assignedTruck: true },
      }),
      this.prisma.rFIDTag.count(),
    ]);

    return {
      data: rfidTags,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findRfidTagById(id: string): Promise<RfidTagWithTruck | null> {
    return this.prisma.rFIDTag.findUnique({
      where: { id },
      include: { assignedTruck: true },
    });
  }
}
