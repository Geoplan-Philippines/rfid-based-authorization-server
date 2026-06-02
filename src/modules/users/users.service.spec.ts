import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDTO } from './users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

const mockUser = {
  id: 'user-uuid-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  password: 'hashedpassword',
  role: 'ADMIN' as const,
  isArchived: false,
  creaetedAt: new Date(),
  updatedAt: new Date(),
};

const mockSafeUser = (() => {
  const { password, ...safe } = mockUser;
  return safe;
})();

const mockPrismaService = {
  user: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

  describe('UsersService', () => {
    let service: UsersService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: PrismaService, useValue: mockPrismaService }
        ],
      }).compile();

      service = module.get<UsersService>(UsersService);
      jest.resetAllMocks();
    });

  describe('createUser', () => {
    const dto: CreateUserDTO = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: '  JUAN@example.com  ',
      password: 'password123',
    };
 
    it('creates and returns a safe user on success', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockSafeUser);
 
      const result = await service.createUser(dto);
 
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'juan@example.com' },
      });
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(result).toEqual(mockSafeUser);
    });
 
    it('normalizes email to lowercase and trimmed before lookup', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockSafeUser);
 
      await service.createUser(dto);
 
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'juan@example.com' },
      });
    });
 
    it('throws ConflictException when email is already in use', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
 
      await expect(service.createUser(dto)).rejects.toThrow(ConflictException);
    });
 
    it('hashes the password before saving', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockSafeUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedpassword');
      
      await service.createUser(dto);
 
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    });
  });
 
  describe('getAllUsers', () => {
    it('returns all users without passwords', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockSafeUser]);
 
      const result = await service.getAllUsers();
 
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        omit: { password: true },
      });
      expect(result).toEqual([mockSafeUser]);
    });
  });
 
  describe('findUserByEmail', () => {
    it('returns the user when found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
 
      const result = await service.findUserByEmail('juan@example.com');
 
      expect(result).toEqual(mockUser);
    });
 
    it('returns null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
 
      const result = await service.findUserByEmail('notfound@example.com');
 
      expect(result).toBeNull();
    });
 
    it('normalizes email before lookup', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
 
      await service.findUserByEmail('  JUAN@EXAMPLE.COM  ');
 
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'juan@example.com' },
      });
    });
  });
 
  describe('findUserById', () => {
    it('returns the safe user when found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockSafeUser);
 
      const result = await service.findUserById('user-uuid-1');
 
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        omit: { password: true },
      });
      expect(result).toEqual(mockSafeUser);
    });
 
    it('returns null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
 
      const result = await service.findUserById('nonexistent-uuid');
 
      expect(result).toBeNull();
    });
  });
});