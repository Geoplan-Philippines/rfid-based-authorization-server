import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { CreateRfidTagDTO } from './dto/create-rfid-tag.dto';
import { GetAllRfidTagsQueryDTO } from './dto/get-all-rfid-tags-query.dto';
import { RfidTagsService } from './rfid-tags.service';
import { RfidTagWithTruck } from './types/rfid-tags.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('rfid-tags')
export class RfidTagsController {
  constructor(private readonly rfidTagsService: RfidTagsService) {}

  @Post()
  @UseGuards(PassportJwtGuard)
  async createRfidTag(@Body() body: CreateRfidTagDTO): Promise<RfidTagWithTruck> {
    return this.rfidTagsService.createRfidTag(body);
  }

  @Get()
  @UseGuards(PassportJwtGuard)
  async getAllRfidTags(@Query() query: GetAllRfidTagsQueryDTO): Promise<PaginatedResponse<RfidTagWithTruck>> {
    return this.rfidTagsService.getAllRfidTags(query);
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async findRfidTagById(@Param('id', ParseUUIDPipe) id: string): Promise<RfidTagWithTruck> {
    const rfidTag = await this.rfidTagsService.findRfidTagById(id);
    if (!rfidTag) throw new NotFoundException('RFID tag not found');
    return rfidTag;
  }
}
