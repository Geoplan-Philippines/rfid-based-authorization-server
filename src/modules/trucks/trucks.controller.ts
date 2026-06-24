import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Truck } from '@prisma/client';

import { IMAGE_UPLOAD_OPTIONS } from 'src/common/uploads/image-upload.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateTruckDTO } from './dto/create-truck.dto';
import { GetAllTrucksQueryDTO } from './dto/get-all-trucks-query.dto';
import { UpdateTruckDTO } from './dto/update-truck.dto';
import { TrucksService } from './trucks.service';
import type { TruckDetail, TruckListResponse, TruckUntaggedItem, TruckWithDrivers } from './types/trucks.types';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('trucks')
@UseGuards(PassportJwtGuard)
export class TrucksController {
  constructor(private readonly trucksService: TrucksService) {}

  @Post()
  async createTruck(
    @Body() body: CreateTruckDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Truck> {
    return this.trucksService.createTruck(body, user.id);
  }

  @Get()
  async getAllTrucks(@Query() query: GetAllTrucksQueryDTO): Promise<TruckListResponse> {
    return this.trucksService.getAllTrucks(query);
  }

  @Get('with-drivers')
  async getAllTrucksWithDrivers(): Promise<TruckWithDrivers[]> {
    return this.trucksService.getAllTrucksWithDrivers();
  }

  @Get('untagged')
  async getUntaggedTrucks(): Promise<TruckUntaggedItem[]> {
    return this.trucksService.getUntaggedTrucks();
  }

  @Get(':id')
  async getTruckById(@Param('id', ParseUUIDPipe) id: string): Promise<TruckDetail> {
    return this.trucksService.getTruckById(id);
  }

  @Patch(':id')
  async updateTruck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTruckDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Truck> {
    return this.trucksService.updateTruck(id, body, user.id);
  }

  @Post(':id/archive')
  async archiveTruck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Truck> {
    return this.trucksService.archiveTruck(id, user.id);
  }

  @Post(':id/restore')
  async restoreTruck(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Truck> {
    return this.trucksService.restoreTruck(id, user.id);
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', IMAGE_UPLOAD_OPTIONS))
  async saveTruckPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Truck> {
    return this.trucksService.saveTruckPhoto(id, photo, user.id);
  }
}
