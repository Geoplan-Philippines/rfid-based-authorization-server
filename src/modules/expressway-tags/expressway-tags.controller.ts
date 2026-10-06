import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ExpresswayTagsService } from './expressway-tags.service';
import { CreateExpresswayTagDto } from './dto/create-expressway-tag.dto';
import { GetAllExpresswayTagsQueryDTO } from './dto/get-all-expressway-tags-query.dto';
import { UpdateExpresswayTagDto } from './dto/update-expressway-tag.dto';
import { UpdateExpresswayTagStatusDto } from './dto/update-expressway-tag-status.dto';
import { ExpresswayTagDetail, ExpresswayTagListResponse, ExpresswayTagWithTruck } from './types/expressway-tags.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('expressway-tags')
@UseGuards(PassportJwtGuard)
export class ExpresswayTagsController {
  constructor(private readonly expresswayTagsService: ExpresswayTagsService) {}

  @Post()
  async createExpresswayTag(
    @Body() body: CreateExpresswayTagDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExpresswayTagWithTruck> {
    return this.expresswayTagsService.createExpresswayTag(body, user.id);
  }

  @Get()
  async getAllExpresswayTags(@Query() query: GetAllExpresswayTagsQueryDTO): Promise<ExpresswayTagListResponse> {
    return this.expresswayTagsService.getAllExpresswayTags(query);
  }

  @Get('by-epc/:epcId')
  async findByEpcId(@Param('epcId') epcId: string): Promise<ExpresswayTagWithTruck | null> {
    return this.expresswayTagsService.findByEpcId(epcId);
  }

  @Get(':id')
  async getExpresswayTagById(@Param('id') id: string): Promise<ExpresswayTagDetail> {
    return this.expresswayTagsService.getExpresswayTagById(id);
  }

  @Patch(':id')
  async updateExpresswayTag(
    @Param('id') id: string,
    @Body() body: UpdateExpresswayTagDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExpresswayTagDetail> {
    return this.expresswayTagsService.updateExpresswayTag(id, body, user.id);
  }

  @Patch(':id/status')
  async updateExpresswayTagStatus(
    @Param('id') id: string,
    @Body() body: UpdateExpresswayTagStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExpresswayTagDetail> {
    return this.expresswayTagsService.updateExpresswayTagStatus(id, body, user.id);
  }
}
