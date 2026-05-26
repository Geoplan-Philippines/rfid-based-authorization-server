import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { Truck } from '@prisma/client';

import { GetAllTrucksQueryDTO } from './dto/get-all-trucks-query.dto';
import { CreateTruckDTO } from './dto/create-truck.dto';
import { TrucksService } from './trucks.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('trucks')
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Post()
  @UseGuards(PassportJwtGuard)
  createTruck(@Body() createTruckDTO: CreateTruckDTO): Promise<Truck> {
    return this.trucksService.createTruck(createTruckDTO);
  }

  @Get()
  @UseGuards(PassportJwtGuard)
  getAllTrucks(@Query() query: GetAllTrucksQueryDTO): Promise<PaginatedResponse<Truck>> {
    return this.trucksService.getAllTrucks(query);
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async findTruckById(@Param('id', ParseUUIDPipe) id: string): Promise<Truck> {
    const truck = await this.trucksService.findTruckById(id);
    if (!truck) throw new NotFoundException('Truck not found');
    return truck;
  }
}