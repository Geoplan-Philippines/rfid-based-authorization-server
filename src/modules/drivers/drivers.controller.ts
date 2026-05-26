import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { Driver } from '@prisma/client';

import { CreateDriverDTO } from './dto/create-driver.dto';
import { GetAllDriversQueryDTO } from './dto/get-all-drivers-query.dto';
import { DriversService } from './drivers.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @UseGuards(PassportJwtGuard)
  createDriver(@Body() createDriverDTO: CreateDriverDTO): Promise<Driver> {
    return this.driversService.createDriver(createDriverDTO);
  }

  @Get()
  @UseGuards(PassportJwtGuard)
  getAllDrivers(@Query() query: GetAllDriversQueryDTO): Promise<PaginatedResponse<Driver>> {
    return this.driversService.getAllDrivers(query);
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async findDriverById(@Param('id', ParseUUIDPipe) id: string): Promise<Driver> {
    const driver = await this.driversService.findDriverById(id);
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }
}