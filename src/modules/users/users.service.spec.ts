import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UsersService } from './users.service';

jest.mock('bcrypt');

const mockSafeUser = {
  id: 'b3d2f1a0-1111-4222-8333-444455556666',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  role: 'ADMIN' as const,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser = { ...mockSafeUser, password: 'hashed-password' };

const uniqueEmailError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: 'test',
  meta: { target: ['email'] },
});

describe('UsersService', () => {
  let service: UsersService;

  const transactionClient = {
    user: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const prismaService = {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const auditLogsService = {
    recordAuditLog: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaService.$transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('createUser', () => {
    const body = {
      firstName: ' Juan ',
      lastName: ' Dela Cruz ',
      email: ' Juan@Example.com ',
      password: 'password123',
    };

    it('normalizes input, hashes the password, and writes an audit log', async () => {
      transactionClient.user.create.mockResolvedValue(mockSafeUser);

      const result = await service.createUser(body, 'actor-1');

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(transactionClient.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          email: 'juan@example.com',
          password: 'hashed-password',
          role: undefined,
        },
        omit: { password: true },
      });
      expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
        actorId: 'actor-1',
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: mockUser.id,
        metadata: { email: 'juan@example.com', role: 'ADMIN' },
      }, transactionClient);
      expect(result).not.toHaveProperty('password');
    });

    it('translates a unique-email violation into ConflictException', async () => {
      transactionClient.user.create.mockRejectedValue(uniqueEmailError);

      await expect(service.createUser(body)).rejects.toThrow(ConflictException);
    });
  });

  describe('getAllUsers', () => {
    const query = { page: 1, limit: 10, includeArchived: false };

    beforeEach(() => {
      prismaService.user.findMany.mockResolvedValue([mockSafeUser]);
      prismaService.user.count.mockResolvedValue(1);
    });

    it('paginates newest first and hides archived users by default', async () => {
      const result = await service.getAllUsers(query);

      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        where: { AND: [{ isArchived: false }] },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        omit: { password: true },
      });
      expect(result).toEqual({
        data: [mockSafeUser],
        meta: { total: 1, page: 1, limit: 10, lastPage: 1 },
      });
    });

    it('drops the archived filter and applies the role filter when requested', async () => {
      await service.getAllUsers({ ...query, includeArchived: true, role: 'OPERATOR' as const });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ role: 'OPERATOR' }] } }),
      );
    });

    it('searches names and email, and adds an exact id match for UUID input', async () => {
      await service.getAllUsers({ ...query, search: '  juan  ' });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { isArchived: false },
              {
                OR: [
                  { firstName: { contains: 'juan', mode: 'insensitive' } },
                  { lastName: { contains: 'juan', mode: 'insensitive' } },
                  { email: { contains: 'juan', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );

      await service.getAllUsers({ ...query, search: mockUser.id });

      expect(prismaService.user.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { isArchived: false },
              { OR: [{ id: mockUser.id }, expect.anything(), expect.anything(), expect.anything()] },
            ],
          },
        }),
      );
    });

    it('skips forward for later pages', async () => {
      await service.getAllUsers({ ...query, page: 3, limit: 20 });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    });
  });

  describe('findUserById', () => {
    it('hides archived users from the authentication path unless explicitly included', async () => {
      const archivedUser = { ...mockSafeUser, isArchived: true };
      prismaService.user.findUnique.mockResolvedValue(archivedUser);

      await expect(service.findUserById(mockUser.id)).resolves.toBeNull();
      await expect(service.findUserById(mockUser.id, true)).resolves.toEqual(archivedUser);
    });
  });

  describe('getUserById', () => {
    it('returns archived users so the management detail screen stays reachable', async () => {
      const archivedUser = { ...mockSafeUser, isArchived: true };
      prismaService.user.findUnique.mockResolvedValue(archivedUser);

      await expect(service.getUserById(mockUser.id)).resolves.toEqual(archivedUser);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserById(mockUser.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser(mockUser.id, { firstName: 'New' })).rejects.toThrow(NotFoundException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user is archived', async () => {
      prismaService.user.findUnique.mockResolvedValue({ ...mockUser, isArchived: true });

      await expect(service.updateUser(mockUser.id, { firstName: 'New' })).rejects.toThrow(ConflictException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no updatable field is supplied', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.updateUser(mockUser.id, {})).rejects.toThrow(BadRequestException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when promoting anyone to SUPER_ADMIN', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(mockUser.id, { role: 'SUPER_ADMIN' as const }, 'actor-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the actor changes their own role', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(mockUser.id, { role: 'OPERATOR' as const }, mockUser.id),
      ).rejects.toThrow(ForbiddenException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('allows the actor to edit their own non-role fields', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      transactionClient.user.update.mockResolvedValue(mockSafeUser);

      await expect(service.updateUser(mockUser.id, { firstName: 'Self' }, mockUser.id)).resolves.toEqual(mockSafeUser);
    });

    it('normalizes email, hashes the password, and audits the changed field names', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      transactionClient.user.update.mockResolvedValue(mockSafeUser);

      const result = await service.updateUser(
        mockUser.id,
        { email: ' NEW@Example.com ', password: 'newpassword123' },
        'actor-1',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(transactionClient.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { email: 'new@example.com', password: 'hashed-password' },
        omit: { password: true },
      });
      expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
        actorId: 'actor-1',
        action: 'UPDATE_USER',
        entityType: 'User',
        entityId: mockUser.id,
        metadata: { fields: ['email', 'password'] },
      }, transactionClient);
      expect(result).not.toHaveProperty('password');
    });

    it('translates a unique-email violation into ConflictException', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      transactionClient.user.update.mockRejectedValue(uniqueEmailError);

      await expect(service.updateUser(mockUser.id, { email: 'taken@example.com' })).rejects.toThrow(ConflictException);
    });
  });

  describe('archiveUser / unarchiveUser', () => {
    it('refuses to archive the acting account', async () => {
      await expect(service.archiveUser(mockUser.id, mockUser.id)).rejects.toThrow(ForbiddenException);
      expect(prismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.archiveUser(mockUser.id, 'actor-1')).rejects.toThrow(NotFoundException);
      await expect(service.unarchiveUser(mockUser.id, 'actor-1')).rejects.toThrow(NotFoundException);
      expect(transactionClient.user.update).not.toHaveBeenCalled();
    });

    it('flips isArchived and audits both directions', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: mockUser.id });
      transactionClient.user.update.mockResolvedValue({ ...mockSafeUser, isArchived: true });

      const archived = await service.archiveUser(mockUser.id, 'actor-1');

      expect(transactionClient.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { isArchived: true },
        omit: { password: true },
      });
      expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
        actorId: 'actor-1',
        action: 'ARCHIVE_USER',
        entityType: 'User',
        entityId: mockUser.id,
        metadata: undefined,
      }, transactionClient);
      expect(archived.isArchived).toBe(true);

      transactionClient.user.update.mockResolvedValue(mockSafeUser);

      const restored = await service.unarchiveUser(mockUser.id, 'actor-1');

      expect(auditLogsService.recordAuditLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'UNARCHIVE_USER' }),
        transactionClient,
      );
      expect(restored.isArchived).toBe(false);
    });
  });
});
