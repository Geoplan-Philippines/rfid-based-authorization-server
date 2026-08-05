import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const actor: AuthenticatedUser = {
  id: 'actor-uuid-1',
  email: 'super@example.com',
  role: 'SUPER_ADMIN',
};

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

describe('UsersController', () => {
  let controller: UsersController;

  const usersService = {
    createUser: jest.fn(),
    getAllUsers: jest.fn(),
    getUserById: jest.fn(),
    updateUser: jest.fn(),
    archiveUser: jest.fn(),
    unarchiveUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('forwards the acting user id to every mutating route', async () => {
    const body = { email: 'juan@example.com', password: 'password123' };
    usersService.createUser.mockResolvedValue(mockSafeUser);
    usersService.updateUser.mockResolvedValue(mockSafeUser);
    usersService.archiveUser.mockResolvedValue({ ...mockSafeUser, isArchived: true });
    usersService.unarchiveUser.mockResolvedValue(mockSafeUser);

    await controller.createUser(body, actor);
    await controller.updateUser('user-uuid-1', { firstName: 'Updated' }, actor);
    await controller.archiveUser('user-uuid-1', actor);
    await controller.unarchiveUser('user-uuid-1', actor);

    expect(usersService.createUser).toHaveBeenCalledWith(body, actor.id);
    expect(usersService.updateUser).toHaveBeenCalledWith('user-uuid-1', { firstName: 'Updated' }, actor.id);
    expect(usersService.archiveUser).toHaveBeenCalledWith('user-uuid-1', actor.id);
    expect(usersService.unarchiveUser).toHaveBeenCalledWith('user-uuid-1', actor.id);
  });

  it('passes the parsed list query straight through', async () => {
    const query = { page: 2, limit: 20, includeArchived: true, role: 'OPERATOR' as const };
    const paginated = { data: [mockSafeUser], meta: { total: 1, page: 2, limit: 20, lastPage: 1 } };
    usersService.getAllUsers.mockResolvedValue(paginated);

    await expect(controller.getAllUsers(query)).resolves.toEqual(paginated);
    expect(usersService.getAllUsers).toHaveBeenCalledWith(query);
  });

  it('returns the user resolved by the service', async () => {
    usersService.getUserById.mockResolvedValue(mockSafeUser);

    await expect(controller.getUserById('user-uuid-1')).resolves.toEqual(mockSafeUser);
  });

  it('propagates service errors unchanged', async () => {
    usersService.getUserById.mockRejectedValue(new NotFoundException('User not found'));
    usersService.archiveUser.mockRejectedValue(new ForbiddenException('Cannot archive your own account.'));

    await expect(controller.getUserById('missing-uuid')).rejects.toThrow(NotFoundException);
    await expect(controller.archiveUser(actor.id, actor)).rejects.toThrow(ForbiddenException);
  });
});
