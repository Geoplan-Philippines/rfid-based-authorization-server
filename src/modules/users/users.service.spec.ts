import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';

jest.mock('bcrypt');

const mockUser = {
  id: 'user-uuid-1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  password: 'hashed-password',
  role: 'ADMIN' as const,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.resetAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  describe('createUser', () => {
    const dto = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'Juan@Example.com',
      password: 'password123',
    };

    it('normalizes email, hashes password, and returns the created user without password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { password, ...safeUser } = mockUser;
      mockPrisma.user.create.mockResolvedValue(safeUser);

      const result = await service.createUser(dto);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'juan@example.com' } });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'juan@example.com', password: 'hashed-password' }),
        omit: { password: true },
      });
      expect(result).not.toHaveProperty('password');
    });

    it('throws ConflictException when the email is already in use', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.createUser(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('getAllUsers', () => {
    it('excludes archived users by default, includes them when requested', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.getAllUsers();
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { isArchived: false },
        omit: { password: true },
      });

      await service.getAllUsers(true);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: undefined,
        omit: { password: true },
      });
    });
  });

  describe('findUserById', () => {
    it('returns null for an archived user by default, but returns it when includeArchived is true', async () => {
      const { password, ...archivedUser } = { ...mockUser, isArchived: true };
      mockPrisma.user.findUnique.mockResolvedValue(archivedUser);

      await expect(service.findUserById('user-uuid-1')).resolves.toBeNull();
      await expect(service.findUserById('user-uuid-1', true)).resolves.toEqual(archivedUser);
    });
  });

  describe('updateUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser('nonexistent-uuid', { firstName: 'New' })).rejects.toThrow(
        NotFoundException
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates non-email, non-password fields directly', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const { password, ...safeUser } = { ...mockUser, firstName: 'Updated' };
      mockPrisma.user.update.mockResolvedValue(safeUser);

      const result = await service.updateUser('user-uuid-1', { firstName: 'Updated' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { firstName: 'Updated' },
        omit: { password: true },
      });
      expect(result).toEqual(safeUser);
    });

    it('normalizes email and skips the conflict check when unchanged after normalization', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      const { password, ...safeUser } = mockUser;
      mockPrisma.user.update.mockResolvedValue(safeUser);

      await service.updateUser('user-uuid-1', { email: 'Juan@Example.com' });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { email: 'juan@example.com' },
        omit: { password: true },
      });
    });

    it('throws ConflictException when the new email belongs to another user', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ ...mockUser, id: 'other-uuid' });

      await expect(
        service.updateUser('user-uuid-1', { email: 'taken@example.com' })
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes the password when provided, and never returns a password field', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const { password, ...safeUser } = mockUser;
      mockPrisma.user.update.mockResolvedValue(safeUser);

      const result = await service.updateUser('user-uuid-1', { password: 'newpassword123' });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { password: 'hashed-password' },
        omit: { password: true },
      });
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('archiveUser / unarchiveUser', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.archiveUser('nonexistent-uuid')).rejects.toThrow(NotFoundException);
      await expect(service.unarchiveUser('nonexistent-uuid')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('archiveUser sets isArchived to true, unarchiveUser sets it back to false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      const { password, ...archived } = { ...mockUser, isArchived: true };
      mockPrisma.user.update.mockResolvedValueOnce(archived);

      const archiveResult = await service.archiveUser('user-uuid-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { isArchived: true },
        omit: { password: true },
      });
      expect(archiveResult.isArchived).toBe(true);

      const { password: _pw, ...restored } = { ...mockUser, isArchived: false };
      mockPrisma.user.update.mockResolvedValueOnce(restored);

      const unarchiveResult = await service.unarchiveUser('user-uuid-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { isArchived: false },
        omit: { password: true },
      });
      expect(unarchiveResult.isArchived).toBe(false);
    });
  });
});
