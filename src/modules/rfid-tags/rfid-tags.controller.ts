import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateRfidTagDTO } from './dto/create-rfid-tag.dto';
import { GetAllRfidTagsQueryDTO } from './dto/get-all-rfid-tags-query.dto';
import { RebindRfidTagDTO } from './dto/rebind-rfid-tag.dto';
import { UpdateRfidTagStatusDTO } from './dto/update-rfid-tag-status.dto';
import { RfidTagsService } from './rfid-tags.service';
import { RfidTagDetail, RfidTagListResponse, RfidTagWithTruck } from './types/rfid-tags.types';

// TODO: Apply RolesGuard and @Roles() decorator to all routes
@Controller('rfid-tags')
@UseGuards(PassportJwtGuard)
export class RfidTagsController {
  constructor(private readonly rfidTagsService: RfidTagsService) {}

  @Post()
  async createRfidTag(
    @Body() body: CreateRfidTagDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RfidTagWithTruck> {
    return this.rfidTagsService.createRfidTag(body, user.id);
  }

  @Get()
  async getAllRfidTags(@Query() query: GetAllRfidTagsQueryDTO): Promise<RfidTagListResponse> {
    return this.rfidTagsService.getAllRfidTags(query);
  }

  @Get(':id')
  async getRfidTagById(@Param('id', ParseUUIDPipe) id: string): Promise<RfidTagDetail> {
    return this.rfidTagsService.getRfidTagById(id);
  }

  @Patch(':id/status')
  async updateRfidTagStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRfidTagStatusDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RfidTagDetail> {
    return this.rfidTagsService.updateRfidTagStatus(id, body, user.id);
  }

  @Patch(':id/rebind')
  async rebindRfidTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RebindRfidTagDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RfidTagDetail> {
    return this.rfidTagsService.rebindRfidTag(id, body, user.id);
  }
}
