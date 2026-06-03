import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CreateUserDTO } from './users.service';

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
};
  
  describe('UsersController', () => {
    let controller: UsersController;
  
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [
          { provide: UsersService, useValue: mockUsersService },
        ],
      }).compile();
  
      controller = module.get<UsersController>(UsersController);
      jest.resetAllMocks();
    });
 
  describe('createUser', () => {
    const dto: CreateUserDTO = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
    };
 
    it('returns the created user', async () => {
      mockUsersService.createUser.mockResolvedValue(mockSafeUser);
 
      const result = await controller.createUser(dto);
 
      expect(mockUsersService.createUser).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockSafeUser);
    });
  });
 
  describe('getAllUsers', () => {
    it('returns all users', async () => {
      mockUsersService.getAllUsers.mockResolvedValue([mockSafeUser]);
 
      const result = await controller.getAllUsers();
 
      expect(mockUsersService.getAllUsers).toHaveBeenCalled();
      expect(result).toEqual([mockSafeUser]);
    });
  });
 
  describe('findUserById', () => {
    it('returns the user when found', async () => {
      mockUsersService.findUserById.mockResolvedValue(mockSafeUser);
 
      const result = await controller.findUserById('user-uuid-1');
 
      expect(mockUsersService.findUserById).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockSafeUser);
    });
 
    it('throws NotFoundException when user does not exist', async () => {
      mockUsersService.findUserById.mockResolvedValue(null);
 
      await expect(controller.findUserById('nonexistent-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
 
