import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(body: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ConflictException('Email already in use');

    return this.prisma.user.create({ 
      data: { ...body, password: await bcrypt.hash(body.password, 10) }
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany();
  }
}
