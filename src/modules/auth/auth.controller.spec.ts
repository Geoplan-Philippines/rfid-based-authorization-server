import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser, AuthResult, LoginUser } from './types/auth.types';

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

const mockAuthResult: AuthResult = {
  id: 'user-uuid-1',
  email: 'juan@example.com',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  role: 'ADMIN' as const,
  accessToken: 'mock-jwt-token',
};

const mockAuthService = {
  login: jest.fn(),
};

const mockUsersService = {
  findUserById: jest.fn(),
};

  describe('AuthController', () => {
    let controller: AuthController;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: AuthService, useValue: mockAuthService },
          { provide: UsersService, useValue: mockUsersService },
        ],
      }).compile();

      controller = module.get<AuthController>(AuthController);
      jest.resetAllMocks();
    });

  describe('login', () => {
      const loginUser: LoginUser = {
        id: 'user-uuid-1',
        email: 'juan@example.com',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        role: 'ADMIN' as const,
      };

    it('returns AuthResult with accessToken', async () => {
        mockAuthService.login.mockResolvedValue(mockAuthResult);

      const result = await controller.login(loginUser);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginUser);
      expect(result).toEqual(mockAuthResult);
    });
  });

  describe('getUserInfo', () => {
      const authenticatedUser: AuthenticatedUser = {
        id: 'user-uuid-1',
        email: 'juan@example.com',
        role: 'ADMIN' as const,
      };

    it('returns fresh user data when user exists', async () => {
        mockUsersService.findUserById.mockResolvedValue(mockSafeUser);

      const result = await controller.getUserInfo(authenticatedUser);

      expect(mockUsersService.findUserById).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toEqual(mockSafeUser);
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      mockUsersService.findUserById.mockResolvedValue(null);

      await expect(controller.getUserInfo(authenticatedUser)).rejects.toThrow(UnauthorizedException);
    });
  });
});