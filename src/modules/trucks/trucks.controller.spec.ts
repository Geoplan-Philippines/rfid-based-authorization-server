import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';

import { TrucksController } from './trucks.controller';
import { TrucksService } from './trucks.service';

describe('TrucksController', () => {
  let controller: TrucksController;

  const trucksService = {
    createTruck: jest.fn(),
    getAllTrucks: jest.fn(),
    getAllTrucksWithDrivers: jest.fn(),
    getUntaggedTrucks: jest.fn(),
    getTruckById: jest.fn(),
    updateTruck: jest.fn(),
    archiveTruck: jest.fn(),
    restoreTruck: jest.fn(),
    banTruck: jest.fn(),
    liftTruckBan: jest.fn(),
    saveTruckPhoto: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrucksController],
      providers: [{ provide: TrucksService, useValue: trucksService }],
    }).compile();

    controller = module.get<TrucksController>(TrucksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates truck creation with the authenticated actor id', async () => {
    const body = { plateNumber: 'ABC 123', model: 'Mixer' };
    const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
    trucksService.createTruck.mockResolvedValue({ id: 'truck-1', ...body });

    await controller.createTruck(body, user);

    expect(trucksService.createTruck).toHaveBeenCalledWith(body, 'user-1');
  });

  it('delegates untagged truck lookups', async () => {
    trucksService.getUntaggedTrucks.mockResolvedValue([]);

    await controller.getUntaggedTrucks();

    expect(trucksService.getUntaggedTrucks).toHaveBeenCalledWith();
  });

  it('delegates a truck ban with the authenticated actor id', async () => {
    const body = { isPermanent: true };
    const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
    trucksService.banTruck.mockResolvedValue({ id: 'truck-1', isPermanentlyBanned: true });

    await controller.banTruck('truck-1', body, user);

    expect(trucksService.banTruck).toHaveBeenCalledWith('truck-1', body, 'user-1');
  });

  it('delegates lifting a truck ban with the authenticated actor id', async () => {
    const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
    trucksService.liftTruckBan.mockResolvedValue({ id: 'truck-1', isPermanentlyBanned: false, bannedUntil: null });

    await controller.liftTruckBan('truck-1', user);

    expect(trucksService.liftTruckBan).toHaveBeenCalledWith('truck-1', 'user-1');
  });
});
