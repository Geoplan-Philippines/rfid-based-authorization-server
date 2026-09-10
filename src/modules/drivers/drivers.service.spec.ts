import { Test, TestingModule } from '@nestjs/testing';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DriversService } from './drivers.service';

describe('DriversService', () => {
  let service: DriversService;

  const transactionClient = {
    driver: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const prismaService = {
    $transaction: jest.fn(),
    driver: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const gateEventAnalyticsService = {
    getDriverGateEventSummaries: jest.fn(),
    getRecentDriverGateEvents: jest.fn(),
  };

  const imageUploadService = {
    saveRegistryPhoto: jest.fn(),
  };

  const auditLogsService = {
    recordAuditLog: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaService.$transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: PrismaService, useValue: prismaService },
        { provide: GateEventAnalyticsService, useValue: gateEventAnalyticsService },
        { provide: ImageUploadService, useValue: imageUploadService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes driver data and writes an audit log when creating a driver', async () => {
    const driver = {
      id: 'driver-1',
      driverId: 'DRV-00001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      licenseNumber: 'N01-23-456789',
    };
    transactionClient.driver.create.mockResolvedValue(driver);

    const result = await service.createDriver({
      driverId: 'DRV-00001',
      firstName: ' juan ',
      lastName: ' dela cruz ',
      licenseNumber: ' n01-23-456789 ',
    }, 'user-1');

    expect(result).toBe(driver);
    expect(transactionClient.driver.create).toHaveBeenCalledWith({
      data: {
        driverId: 'DRV-00001',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        licenseNumber: 'N01-23-456789',
      },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'CREATE_DRIVER',
      entityType: 'Driver',
      entityId: 'driver-1',
      metadata: { driverId: 'DRV-00001', licenseNumber: 'N01-23-456789' },
    }, transactionClient);
  });

  it('reads the stored driver id back on driver detail', async () => {
    const createdAt = new Date('2026-09-09T00:00:00.000Z');
    prismaService.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      driverId: 'DRV-00001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      licenseNumber: 'N01-23-456789',
      photoUrl: null,
      isArchived: false,
      isPermanentlyBanned: false,
      bannedUntil: null,
      createdAt,
      truckAssignments: [],
    });
    gateEventAnalyticsService.getDriverGateEventSummaries.mockResolvedValue({
      'driver-1': {
        events30d: 0,
        denials7d: 0,
        denials30d: 0,
        lastEventAt: null,
        lastResult: null,
      },
    });
    gateEventAnalyticsService.getRecentDriverGateEvents.mockResolvedValue([]);

    const result = await service.getDriverById('driver-1');

    expect(result).toEqual(expect.objectContaining({
      id: 'driver-1',
      driverId: 'DRV-00001',
    }));
  });

  it('bans a driver permanently and writes an audit log', async () => {
    prismaService.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
    const driver = { id: 'driver-1', isPermanentlyBanned: true, bannedUntil: null };
    transactionClient.driver.update.mockResolvedValue(driver);

    const result = await service.banDriver('driver-1', { isPermanent: true }, 'user-1');

    expect(result).toBe(driver);
    expect(transactionClient.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { isPermanentlyBanned: true, bannedUntil: null },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'BAN_DRIVER',
      entityType: 'Driver',
      entityId: 'driver-1',
      metadata: { banType: 'PERMANENT', bannedUntil: null },
    }, transactionClient);
  });

  it('lifts a driver ban and restores eligibility', async () => {
    prismaService.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
    transactionClient.driver.update.mockResolvedValue({
      id: 'driver-1',
      isPermanentlyBanned: false,
      bannedUntil: null,
    });

    await service.liftDriverBan('driver-1', 'user-1');

    expect(transactionClient.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { isPermanentlyBanned: false, bannedUntil: null },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'LIFT_DRIVER_BAN',
      entityType: 'Driver',
      entityId: 'driver-1',
    }, transactionClient);
  });
});
