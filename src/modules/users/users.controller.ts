import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RoleEnum } from '@prisma/client';

import { CreateUserDTO } from './dto/create-user.dto';
import { UsersService } from './users.service';
import type { SafeUser } from './types/users.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(PassportJwtGuard, RolesGuard)
  @Roles(RoleEnum.SUPER_ADMIN)
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
}
