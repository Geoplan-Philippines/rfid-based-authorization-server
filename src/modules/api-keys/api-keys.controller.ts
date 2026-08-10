import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { Role } from '@prisma/client';

import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDTO } from './dto/create-api-key.dto';
import { GetAllApiKeysQueryDTO } from './dto/get-all-api-keys-query.dto';
import { ApiKeyListItem, CreatedApiKey } from './types/api-keys.types';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// Every route here mints, lists or revokes device credentials, so the guards and role policy are
// declared once at class level: a route added later is protected by default instead of public.
@Controller('api-keys')
@UseGuards(PassportJwtGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  createApiKey(@Body() createApiKeyDTO: CreateApiKeyDTO): Promise<CreatedApiKey> {
    return this.apiKeysService.createApiKey(createApiKeyDTO);
  }

  @Get()
  getAllApiKeys(@Query() query: GetAllApiKeysQueryDTO): Promise<PaginatedResponse<ApiKeyListItem>> {
    return this.apiKeysService.getAllApiKeys(query);
  }

  @Patch(':id/revoke')
  revokeApiKey(@Param('id', ParseUUIDPipe) id: string): Promise<ApiKeyListItem> {
    return this.apiKeysService.revokeApiKey(id);
  }
}
