import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';

import { CreateUserDTO } from './dto/create-user.dto';
import { UsersService } from './users.service';
import type { SafeUser } from './types/users.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateUserDTO } from './dto/update-user.dto';


@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(PassportJwtGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  createUser(@Body() createUserDTO: CreateUserDTO): Promise<SafeUser> {
    return this.usersService.createUser(createUserDTO);
  }

  @Get()
  @UseGuards(PassportJwtGuard)
  getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get(':id')
  @UseGuards(PassportJwtGuard)
  async findUserById(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    const user = await this.usersService.findUserById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @Patch(':id')
  @UseGuards(PassportJwtGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDTO: UpdateUserDTO
  ): Promise<SafeUser> {
    return this.usersService.updateUser(id, updateUserDTO);
  }
 
  @Patch(':id/archive')
  @UseGuards(PassportJwtGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  archiveUser(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    return this.usersService.archiveUser(id);
  }
 
  @Patch(':id/unarchive')
  @UseGuards(PassportJwtGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  unarchiveUser(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    return this.usersService.unarchiveUser(id);
  }
}
