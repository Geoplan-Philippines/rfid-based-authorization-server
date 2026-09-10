import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentRole, RFIDTagStatus } from '@prisma/client';

import { GateEventAnalyticsService } from 'src/common/gate-events/gate-event-analytics.service';
import { ImageUploadService } from 'src/common/uploads/image-upload.service';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { TrucksService } from './trucks.service';

describe('TrucksService', () => {
  let service: TrucksService;

  const transactionClient = {
    truck: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const prismaService = {
    $transaction: jest.fn(),
    truck: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const gateEventAnalyticsService = {
    getTruckGateEventSummaries: jest.fn(),
    getRecentTruckGateEvents: jest.fn(),
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
        TrucksService,
        { provide: PrismaService, useValue: prismaService },
        { provide: GateEventAnalyticsService, useValue: gateEventAnalyticsService },
        { provide: ImageUploadService, useValue: imageUploadService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<TrucksService>(TrucksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes truck data and writes an audit log when creating a truck', async () => {
    const truck = { id: 'truck-1', plateNumber: 'ABC 123', model: 'Mixer' };
    transactionClient.truck.create.mockResolvedValue(truck);

    const result = await service.createTruck({ plateNumber: ' abc 123 ', model: ' Mixer ' }, 'user-1');

    expect(result).toBe(truck);
    expect(transactionClient.truck.create).toHaveBeenCalledWith({
      data: { plateNumber: 'ABC 123', model: 'Mixer' },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'CREATE_TRUCK',
      entityType: 'Truck',
      entityId: 'truck-1',
      metadata: { plateNumber: 'ABC 123' },
    }, transactionClient);
  });

  it('returns paginated trucks with driver, tag, and gate summary data', async () => {
    const lastEventAt = new Date('2026-06-20T08:00:00.000Z');
    const truck = {
      id: 'truck-1',
      plateNumber: 'ABC 123',
      model: 'Mixer',
      photoUrl: null,
      isArchived: false,
      isPermanentlyBanned: false,
      bannedUntil: null,
      rfidTag: { epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
      driverAssignments: [
        {
          role: AssignmentRole.PRIMARY,
          driver: {
            id: 'driver-1',
            firstName: 'Juan',
            lastName: 'Dela Cruz',
          },
        },
      ],
    };

    prismaService.truck.findMany.mockResolvedValue([truck]);
    prismaService.truck.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    gateEventAnalyticsService.getTruckGateEventSummaries.mockResolvedValue({
      'truck-1': {
        events30d: 2,
        denials7d: 0,
        denials30d: 0,
        lastEventAt,
        lastResult: null,
      },
    });

    const result = await service.getAllTrucks({ page: 1, limit: 10, includeArchived: false });

    expect(result).toEqual({
      data: [
        {
          id: 'truck-1',
          plateNumber: 'ABC 123',
          model: 'Mixer',
          photoUrl: null,
          isArchived: false,
          isPermanentlyBanned: false,
          bannedUntil: null,
          isBanned: false,
          drivers: [{ id: 'driver-1', name: 'Juan Dela Cruz', role: AssignmentRole.PRIMARY }],
          driversCount: 1,
          boundTag: { epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
          events30d: 2,
          lastEventAt,
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        lastPage: 1,
        counts: { withNoDriver: 0 },
      },
    });
  });

  it('lists active trucks with no RFID tag for assignment pickers', async () => {
    prismaService.truck.findMany.mockResolvedValue([]);

    await service.getUntaggedTrucks();

    expect(prismaService.truck.findMany).toHaveBeenCalledWith({
      where: { isArchived: false, rfidTag: { is: null } },
      orderBy: { plateNumber: 'asc' },
      select: { id: true, plateNumber: true, model: true },
    });
  });

  it('returns truck detail with active drivers and recent gate events', async () => {
    const createdAt = new Date('2026-06-19T08:00:00.000Z');
    const assignedAt = new Date('2026-06-20T08:00:00.000Z');
    const lastEventAt = new Date('2026-06-21T08:00:00.000Z');
    const recentGateEvents = [
      {
        id: 'event-1',
        eventCode: 'GATE-20260621-0001',
        occurredAt: lastEventAt,
        result: 'VERIFIED',
        truck: { id: 'truck-1', plateNumber: 'ABC 123', model: 'Mixer' },
        driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Dela Cruz' },
      },
    ];

    prismaService.truck.findUnique.mockResolvedValue({
      id: 'truck-1',
      plateNumber: 'ABC 123',
      model: 'Mixer',
      photoUrl: '/uploads/trucks/truck.jpg',
      isArchived: false,
      isPermanentlyBanned: false,
      bannedUntil: null,
      createdAt,
      rfidTag: null,
      driverAssignments: [
        {
          role: AssignmentRole.PRIMARY,
          createdAt: assignedAt,
          driver: {
            id: 'driver-1',
            firstName: 'Juan',
            lastName: 'Dela Cruz',
            licenseNumber: 'N01-23-456789',
            photoUrl: null,
          },
        },
      ],
    });
    gateEventAnalyticsService.getTruckGateEventSummaries.mockResolvedValue({
      'truck-1': {
        events30d: 3,
        denials7d: 0,
        denials30d: 0,
        lastEventAt,
        lastResult: null,
      },
    });
    gateEventAnalyticsService.getRecentTruckGateEvents.mockResolvedValue(recentGateEvents);

    const result = await service.getTruckById('truck-1');

    expect(result).toEqual({
      id: 'truck-1',
      plateNumber: 'ABC 123',
      model: 'Mixer',
      photoUrl: '/uploads/trucks/truck.jpg',
      isArchived: false,
      isPermanentlyBanned: false,
      bannedUntil: null,
      isBanned: false,
      status: 'ACTIVE',
      drivers: [
        {
          id: 'driver-1',
          name: 'Juan Dela Cruz',
          licenseNumber: 'N01-23-456789',
          role: AssignmentRole.PRIMARY,
          since: assignedAt,
          photoUrl: null,
        },
      ],
      boundTag: null,
      events30d: 3,
      lastEventAt,
      lastResult: null,
      recentGateEvents,
      createdAt,
    });
  });

  it('bans a truck permanently and writes an audit log', async () => {
    prismaService.truck.findUnique.mockResolvedValue({ id: 'truck-1' });
    const truck = { id: 'truck-1', plateNumber: 'ABC 123', isPermanentlyBanned: true, bannedUntil: null };
    transactionClient.truck.update.mockResolvedValue(truck);

    const result = await service.banTruck('truck-1', { isPermanent: true }, 'user-1');

    expect(result).toBe(truck);
    expect(transactionClient.truck.update).toHaveBeenCalledWith({
      where: { id: 'truck-1' },
      data: { isPermanentlyBanned: true, bannedUntil: null },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      action: 'BAN_TRUCK',
      entityType: 'Truck',
      entityId: 'truck-1',
      metadata: { banType: 'PERMANENT', bannedUntil: null },
    }, transactionClient);
  });

  it('bans a truck until a date and lifts the ban to restore eligibility', async () => {
    prismaService.truck.findUnique.mockResolvedValue({ id: 'truck-1' });
    const bannedUntil = new Date(2026, 11, 31);
    transactionClient.truck.update
      .mockResolvedValueOnce({ id: 'truck-1', isPermanentlyBanned: false, bannedUntil })
      .mockResolvedValueOnce({ id: 'truck-1', isPermanentlyBanned: false, bannedUntil: null });

    await service.banTruck('truck-1', { isPermanent: false, until: '2026-12-31' }, 'user-1');
    await service.liftTruckBan('truck-1', 'user-1');

    expect(transactionClient.truck.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'truck-1' },
      data: { isPermanentlyBanned: false, bannedUntil },
    });
    expect(transactionClient.truck.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'truck-1' },
      data: { isPermanentlyBanned: false, bannedUntil: null },
    });
    expect(auditLogsService.recordAuditLog).toHaveBeenNthCalledWith(2, {
      actorId: 'user-1',
      action: 'LIFT_TRUCK_BAN',
      entityType: 'Truck',
      entityId: 'truck-1',
    }, transactionClient);
  });
});
