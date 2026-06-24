import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Driver } from '@prisma/client';

import { IMAGE_UPLOAD_OPTIONS } from 'src/common/uploads/image-upload.constants';
import { CreateDriverDTO } from './dto/create-driver.dto';
import { GetAllDriversQueryDTO } from './dto/get-all-drivers-query.dto';
import { UpdateDriverDTO } from './dto/update-driver.dto';
import { DriversService } from './drivers.service';
import { DriverDetail, DriverListResponse, DriverWithTrucks } from './types/drivers.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('drivers')
@UseGuards(PassportJwtGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  async createDriver(
    @Body() body: CreateDriverDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Driver> {
    return this.driversService.createDriver(body, user.id);
  }

  @Get()
  async getAllDrivers(@Query() query: GetAllDriversQueryDTO): Promise<DriverListResponse> {
    return this.driversService.getAllDrivers(query);
  }

  @Get('with-trucks')
  async getAllDriversWithTrucks(): Promise<DriverWithTrucks[]> {
    return this.driversService.getAllDriversWithTrucks();
  }

  @Get(':id/with-trucks')
  async getDriverWithTrucksById(@Param('id', ParseUUIDPipe) id: string): Promise<DriverWithTrucks> {
    const driver = await this.driversService.getDriverWithTrucksById(id);
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  @Get(':id')
  async getDriverById(@Param('id', ParseUUIDPipe) id: string): Promise<DriverDetail> {
    return this.driversService.getDriverById(id);
  }

  @Patch(':id')
  async updateDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDriverDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Driver> {
    return this.driversService.updateDriver(id, body, user.id);
  }

  @Post(':id/archive')
  async archiveDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Driver> {
    return this.driversService.archiveDriver(id, user.id);
  }

  @Post(':id/restore')
  async restoreDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Driver> {
    return this.driversService.restoreDriver(id, user.id);
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', IMAGE_UPLOAD_OPTIONS))
  async saveDriverPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Driver> {
    return this.driversService.saveDriverPhoto(id, photo, user.id);
  }
}
