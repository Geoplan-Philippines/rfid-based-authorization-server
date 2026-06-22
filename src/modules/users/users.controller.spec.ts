import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UpdateUserDTO } from './dto/update-user.dto';

const mockSafeUser = {
  id: 'user-uuid-1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  role: 'ADMIN' as const,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsersService = {
  createUser: jest.fn(),
  getAllUsers: jest.fn(),
  findUserById: jest.fn(),
  updateUser: jest.fn(),
  archiveUser: jest.fn(),
  unarchiveUser: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.resetAllMocks();
  });

  it('delegates simple pass-through routes to the service', async () => {
    mockUsersService.createUser.mockResolvedValue(mockSafeUser);
    mockUsersService.getAllUsers.mockResolvedValue([mockSafeUser]);
    mockUsersService.archiveUser.mockResolvedValue({ ...mockSafeUser, isArchived: true });
    mockUsersService.unarchiveUser.mockResolvedValue(mockSafeUser);

    await expect(
      controller.createUser({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan@example.com',
        password: 'password123',
      })
    ).resolves.toEqual(mockSafeUser);

    await expect(controller.getAllUsers()).resolves.toEqual([mockSafeUser]);
    await expect(controller.archiveUser('user-uuid-1')).resolves.toMatchObject({ isArchived: true });
    await expect(controller.unarchiveUser('user-uuid-1')).resolves.toEqual(mockSafeUser);

    expect(mockUsersService.archiveUser).toHaveBeenCalledWith('user-uuid-1');
    expect(mockUsersService.unarchiveUser).toHaveBeenCalledWith('user-uuid-1');
  });

  describe('findUserById', () => {
    it('returns the user when found', async () => {
      mockUsersService.findUserById.mockResolvedValue(mockSafeUser);

      const result = await controller.findUserById('user-uuid-1');

      expect(result).toEqual(mockSafeUser);
    });

    it('throws NotFoundException when the service returns null', async () => {
      mockUsersService.findUserById.mockResolvedValue(null);

      await expect(controller.findUserById('nonexistent-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    const dto: UpdateUserDTO = { firstName: 'Updated' };

    it('returns the updated user', async () => {
      const updated = { ...mockSafeUser, firstName: 'Updated' };
      mockUsersService.updateUser.mockResolvedValue(updated);

      const result = await controller.updateUser('user-uuid-1', dto);

      expect(mockUsersService.updateUser).toHaveBeenCalledWith('user-uuid-1', dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException when the user does not exist', async () => {
      mockUsersService.updateUser.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.updateUser('nonexistent-uuid', dto)).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException on duplicate email', async () => {
      mockUsersService.updateUser.mockRejectedValue(new ConflictException('Email already in use'));

      await expect(
        controller.updateUser('user-uuid-1', { email: 'taken@example.com' })
      ).rejects.toThrow(ConflictException);
    });
  });
});
