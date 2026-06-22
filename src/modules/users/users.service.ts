import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { User } from '@prisma/client';
import type { SafeUser } from './types/users.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(createUserDTO: CreateUserDTO): Promise<SafeUser> {
    const email = this.normalizeEmail(createUserDTO.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');

    return this.prisma.user.create({
      data: {
        ...createUserDTO,
        email,
        password: await bcrypt.hash(createUserDTO.password, 10),
      },
      omit: { password: true },
    });
  }

  async getAllUsers(includeArchived = false) {
    return this.prisma.user.findMany({
      where: includeArchived ? undefined : { isArchived: false },
      omit: { password: true },
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: this.normalizeEmail(email) } });
  }

  async findUserById(id: string, includeArchived = false): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });

    if (!user) return null;
    if (!includeArchived && user.isArchived) return null;

    return user;
  }

  async updateUser(id: string, updateUserDTO: UpdateUserDTO): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    const data: Partial<User> = { ...updateUserDTO };

    if (updateUserDTO.email) {
      const email = this.normalizeEmail(updateUserDTO.email);

      if (email !== existing.email) {
        const conflict = await this.prisma.user.findUnique({ where: { email } });
        if (conflict) throw new ConflictException('Email already in use');
      }

      data.email = email;
    }

    if (updateUserDTO.password) {
      data.password = await bcrypt.hash(updateUserDTO.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      omit: { password: true },
    });
  }

  async archiveUser(id: string): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { isArchived: true },
      omit: { password: true },
    });
  }

  async unarchiveUser(id: string): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
 
    return this.prisma.user.update({
      where: { id },
      data: { isArchived: false },
      omit: { password: true },
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
