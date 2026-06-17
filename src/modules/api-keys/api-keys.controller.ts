import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { Role } from '@prisma/client';

import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDTO } from './dto/create-api-key.dto';
import { GetAllApiKeysQueryDTO } from './dto/get-all-api-keys-query.dto';
import { ApiKeyListItem, CreatedApiKey } from './types/api-keys.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @UseGuards(PassportJwtGuard, RolesGuard)
  createApiKey(@Body() createApiKeyDTO: CreateApiKeyDTO): Promise<CreatedApiKey> {
    return this.apiKeysService.createApiKey(createApiKeyDTO);
  }

  @Get()
  @UseGuards(PassportJwtGuard, RolesGuard)
  getAllApiKeys(@Query() query: GetAllApiKeysQueryDTO): Promise<PaginatedResponse<ApiKeyListItem>> {
    return this.apiKeysService.getAllApiKeys(query);
  }

  @Patch(':id/revoke')
  @UseGuards(PassportJwtGuard, RolesGuard)
  revokeApiKey(@Param('id', ParseUUIDPipe) id: string): Promise<ApiKeyListItem> {
    return this.apiKeysService.revokeApiKey(id);
  }
}
