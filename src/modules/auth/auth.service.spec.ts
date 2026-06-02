import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDTO } from './dto/login.dto';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

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
 
const mockUsersService = {
  findUserByEmail: jest.fn(),
};
 
const mockJwtService = {
  signAsync: jest.fn(),
};
 
  describe('AuthService', () => {
    let service: AuthService;
  
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: mockUsersService },
          { provide: JwtService, useValue: mockJwtService },
        ],
      }).compile();
  
      service = module.get<AuthService>(AuthService);
      jest.resetAllMocks();
    });
 
  describe('validateUser', () => {
    const dto: LoginDTO = {
      email: 'juan@example.com',
      password: 'password123',
    };
 
    it('returns safe user when credentials are valid', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
 
      const result = await service.validateUser(dto);
 
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe(mockUser.email);
    });
 
    it('throws UnauthorizedException when password is invalid', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
 
      await expect(service.validateUser(dto)).rejects.toThrow(UnauthorizedException);
    });
 
    it('throws UnauthorizedException when user does not exist', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
 
      await expect(service.validateUser(dto)).rejects.toThrow(UnauthorizedException);
    });
 
    it('still runs bcrypt compare even when user is not found (timing attack prevention)', async () => {
      mockUsersService.findUserByEmail.mockResolvedValue(null);
      const compareSpy = bcrypt.compare as jest.Mock;
      compareSpy.mockResolvedValue(false);
 
      await expect(service.validateUser(dto)).rejects.toThrow(UnauthorizedException);
 
      expect(compareSpy).toHaveBeenCalled();
    });
  });
 
  describe('login', () => {
    const loginUser = {
      id: 'user-uuid-1',
      email: 'juan@example.com',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      role: 'ADMIN' as const,
    };
 
    it('returns AuthResult with accessToken', async () => {
      mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
 
      const result = await service.login(loginUser);
 
      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: loginUser.id,
        email: loginUser.email,
        role: loginUser.role,
      });
      expect(result).toEqual({
        ...loginUser,
        accessToken: 'mock-jwt-token',
      });
    });
 
    it('includes correct JWT payload fields', async () => {
      mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
 
      await service.login(loginUser);
 
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: loginUser.id,
          email: loginUser.email,
          role: loginUser.role,
        }),
      );
    });
  });
});