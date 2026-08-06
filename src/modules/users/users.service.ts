import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PASSWORD_SALT_ROUNDS, USER_AUDIT_ACTION, USER_ENTITY_TYPE, UserAuditAction } from './constants/users.constants';
import { CreateUserDTO } from './dto/create-user.dto';
import { GetAllUsersQueryDTO } from './dto/get-all-users-query.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import type { SafeUser, UserListResponse } from './types/users.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createUser(body: CreateUserDTO, actorId?: string): Promise<SafeUser> {
    const data = await this.buildUserCreateData(body);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data, omit: { password: true } });

        await this.recordUserAuditLog(tx, {
          actorId,
          action: USER_AUDIT_ACTION.create,
          entityId: user.id,
          metadata: { email: user.email, role: user.role },
        });

        return user;
      });
    } catch (error) {
      this.throwUserConflict(error);
      throw error;
    }
  }

  async getAllUsers(query: GetAllUsersQueryDTO): Promise<UserListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { password: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: this.normalizeEmail(email) } });
  }

  // Authentication path: an archived account must read as gone, so `/auth/me` and token
  // validation reject it. The management screens use `getUserById` instead.
  async findUserById(id: string, includeArchived = false): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });

    if (!user) return null;
    if (!includeArchived && user.isArchived) return null;

    return user;
  }

  async getUserById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async updateUser(id: string, body: UpdateUserDTO, actorId?: string): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.isArchived) {
      throw new ConflictException('Cannot update an archived user. Unarchive it first.');
    }

    if (body.role !== undefined) this.ensureRoleChangeIsAllowed(existing, body.role, actorId);

    const data = await this.buildUserUpdateData(body);
    if (Object.keys(data).length === 0) throw new BadRequestException('At least one user field is required');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({ where: { id }, data, omit: { password: true } });

        await this.recordUserAuditLog(tx, {
          actorId,
          action: USER_AUDIT_ACTION.update,
          entityId: user.id,
          metadata: { fields: Object.keys(data) },
        });

        return user;
      });
    } catch (error) {
      this.throwUserConflict(error);
      throw error;
    }
  }

  async archiveUser(id: string, actorId?: string): Promise<SafeUser> {
    // Archiving yourself revokes your own login while you are the only role that can undo it.
    if (actorId && id === actorId) throw new ForbiddenException('Cannot archive your own account.');

    return this.setArchivedStatus(id, true, USER_AUDIT_ACTION.archive, actorId);
  }

  async unarchiveUser(id: string, actorId?: string): Promise<SafeUser> {
    return this.setArchivedStatus(id, false, USER_AUDIT_ACTION.unarchive, actorId);
  }

  private async setArchivedStatus(
    id: string,
    isArchived: boolean,
    action: UserAuditAction,
    actorId?: string,
  ): Promise<SafeUser> {
    await this.ensureUserExists(id);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { isArchived }, omit: { password: true } });

      await this.recordUserAuditLog(tx, { actorId, action, entityId: user.id });

      return user;
    });
  }

  private buildListWhere(query: GetAllUsersQueryDTO): Prisma.UserWhereInput {
    const filters: Prisma.UserWhereInput[] = [];
    const search = query.search?.trim();

    if (!query.includeArchived) filters.push({ isArchived: false });
    if (query.role) filters.push({ role: query.role });

    if (search) {
      const searchableFields: Prisma.UserWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];

      if (UUID_PATTERN.test(search)) searchableFields.unshift({ id: search });

      filters.push({ OR: searchableFields });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private async buildUserCreateData(body: CreateUserDTO): Promise<Prisma.UserCreateInput> {
    return {
      firstName: body.firstName?.trim(),
      lastName: body.lastName?.trim(),
      email: this.normalizeEmail(body.email),
      password: await bcrypt.hash(body.password, PASSWORD_SALT_ROUNDS),
      role: body.role,
    };
  }

  private async buildUserUpdateData(body: UpdateUserDTO): Promise<Prisma.UserUpdateInput> {
    const data: Prisma.UserUpdateInput = {};

    if (body.firstName !== undefined) data.firstName = body.firstName.trim();
    if (body.lastName !== undefined) data.lastName = body.lastName.trim();
    if (body.email !== undefined) data.email = this.normalizeEmail(body.email);
    if (body.role !== undefined) data.role = body.role;
    if (body.password !== undefined) data.password = await bcrypt.hash(body.password, PASSWORD_SALT_ROUNDS);

    return data;
  }

  // SUPER_ADMIN is granted at account creation only. Promoting an existing account is the
  // usual privilege-escalation path, and demoting yourself locks user management out for good.
  private ensureRoleChangeIsAllowed(existing: User, role: Role, actorId?: string): void {
    if (role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot promote a user to SUPER_ADMIN via this endpoint.');
    }

    if (actorId && existing.id === actorId && role !== existing.role) {
      throw new ForbiddenException('Cannot change your own role.');
    }
  }

  private async ensureUserExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private async recordUserAuditLog(
    tx: Prisma.TransactionClient,
    input: { actorId?: string; action: UserAuditAction; entityId: string; metadata?: Prisma.InputJsonValue },
  ): Promise<void> {
    await this.auditLogsService.recordAuditLog({
      actorId: input.actorId,
      action: input.action,
      entityType: USER_ENTITY_TYPE,
      entityId: input.entityId,
      metadata: input.metadata,
    }, tx);
  }

  private throwUserConflict(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return;

    throw new ConflictException('Email already in use');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
