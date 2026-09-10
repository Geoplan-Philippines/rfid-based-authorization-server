import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

describe('DriversController', () => {
  let controller: DriversController;
  let testingModule: TestingModule;

  const driversService = {
    createDriver: jest.fn(),
    getAllDrivers: jest.fn(),
    getAllDriversWithTrucks: jest.fn(),
    getDriverWithTrucksById: jest.fn(),
    getDriverById: jest.fn(),
    updateDriver: jest.fn(),
    archiveDriver: jest.fn(),
    restoreDriver: jest.fn(),
    banDriver: jest.fn(),
    liftDriverBan: jest.fn(),
    saveDriverPhoto: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    testingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [{ provide: DriversService, useValue: driversService }],
    }).compile();

    controller = testingModule.get<DriversController>(DriversController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('documents the required locked driver id contract', async () => {
    const app = testingModule.createNestApplication();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1').build(),
    );

    expect(document.components?.schemas?.CreateDriverDTO).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['driverId']),
      properties: expect.objectContaining({
        driverId: expect.objectContaining({
          example: 'DRV-00001',
          pattern: '^DRV-(?!00000)\\d{5}$',
        }),
      }),
    });
    expect(document.paths['/drivers/{id}']?.get?.summary).toContain('permanent Geoplan driver id');

    await app.close();
  });

  it('delegates a driver ban with the authenticated actor id', async () => {
    const body = { isPermanent: false, until: '2026-12-31' };
    const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
    driversService.banDriver.mockResolvedValue({ id: 'driver-1', bannedUntil: new Date(2026, 11, 31) });

    await controller.banDriver('driver-1', body, user);

    expect(driversService.banDriver).toHaveBeenCalledWith('driver-1', body, 'user-1');
  });

  it('delegates lifting a driver ban with the authenticated actor id', async () => {
    const user = { id: 'user-1', email: 'admin@example.com', role: Role.ADMIN };
    driversService.liftDriverBan.mockResolvedValue({ id: 'driver-1', isPermanentlyBanned: false, bannedUntil: null });

    await controller.liftDriverBan('driver-1', user);

    expect(driversService.liftDriverBan).toHaveBeenCalledWith('driver-1', 'user-1');
  });
});
