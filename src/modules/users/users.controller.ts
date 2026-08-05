import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateUserDTO } from './dto/create-user.dto';
import { GetAllUsersQueryDTO } from './dto/get-all-users-query.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import type { SafeUser, UserListResponse } from './types/users.types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(PassportJwtGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(
    @Body() body: CreateUserDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SafeUser> {
    return this.usersService.createUser(body, user.id);
  }

  @Get()
  async getAllUsers(@Query() query: GetAllUsersQueryDTO): Promise<UserListResponse> {
    return this.usersService.getAllUsers(query);
  }

  @Get(':id')
  async getUserById(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    return this.usersService.getUserById(id);
  }

  @Patch(':id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDTO,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SafeUser> {
    return this.usersService.updateUser(id, body, user.id);
  }

  @Patch(':id/archive')
  async archiveUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SafeUser> {
    return this.usersService.archiveUser(id, user.id);
  }

  @Patch(':id/unarchive')
  async unarchiveUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SafeUser> {
    return this.usersService.unarchiveUser(id, user.id);
  }
}
