import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GateEventResult, RFIDTagStatus, SnapshotType, TimelineEventType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { TransactionsService } from './transactions.service';
import { transactionDetailInclude } from './types/transactions.types';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    gateEvent: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      gateEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('filters by search and result, then returns result counts for the current search', async () => {
    const occurredAt = new Date('2026-06-17T00:00:00.000Z');

    prisma.gateEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        eventCode: 'GATE-20260617-0001',
        occurredAt,
        result: GateEventResult.VERIFIED,
        rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
        plateNumberRead: 'ABC-123',
        truck: { plateNumber: 'ABC-123', model: 'Mixer' },
        driver: null,
        timeline: [],
      },
    ]);
    prisma.gateEvent.count.mockResolvedValue(1);
    prisma.gateEvent.groupBy.mockResolvedValue([
      { result: GateEventResult.VERIFIED, _count: { _all: 2 } },
      { result: GateEventResult.PLATE_MISMATCH, _count: { _all: 1 } },
    ]);

    const response = await service.getAllTransactions({
      page: 1,
      limit: 10,
      search: 'ABC',
      result: GateEventResult.VERIFIED,
    });

    const listWhere = prisma.gateEvent.findMany.mock.calls[0][0].where;
    expect(listWhere.AND).toContainEqual({ result: GateEventResult.VERIFIED });
    expect(listWhere.AND[0].OR).toEqual(expect.arrayContaining([
      { eventCode: { contains: 'ABC', mode: 'insensitive' } },
      { plateNumberRead: { contains: 'ABC', mode: 'insensitive' } },
      { rfidTag: { is: { epcId: { contains: 'ABC', mode: 'insensitive' } } } },
      { truck: { is: { plateNumber: { contains: 'ABC', mode: 'insensitive' } } } },
    ]));

    expect(prisma.gateEvent.count).toHaveBeenCalledWith({ where: listWhere });

    const countsWhere = prisma.gateEvent.groupBy.mock.calls[0][0].where;
    expect(countsWhere.AND).toHaveLength(1);
    expect(countsWhere.AND[0]).toEqual(listWhere.AND[0]);

    expect(response.meta.total).toBe(1);
    expect(response.meta.counts).toEqual({
      VERIFIED: 2,
      UNKNOWN_TAG: 0,
      FACE_MISMATCH: 0,
      PLATE_MISMATCH: 1,
      MANUAL_OVERRIDE: 0,
      DENIED: 0,
      ERROR: 0,
    });
  });

  it('returns a mapped transaction detail by id', async () => {
    const occurredAt = new Date('2026-06-17T00:00:00.000Z');
    const verifiedAt = new Date('2026-06-17T00:00:05.000Z');

    prisma.gateEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      eventCode: 'GATE-20260617-0001',
      occurredAt,
      result: GateEventResult.VERIFIED,
      plateNumberRead: 'ABC-123',
      driverId: 'driver-1',
      rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
      truck: {
        plateNumber: 'ABC-123',
        model: 'Mixer',
        driverAssignments: [
          {
            driverId: 'driver-1',
            driver: {
              id: 'driver-1',
              firstName: 'Juan',
              lastName: 'Dela Cruz',
            },
          },
        ],
      },
      driver: {
        id: 'driver-1',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
      },
      verification: {
        rfidMatched: true,
        plateMatched: true,
        faceMatched: true,
        plateConfidence: 0.96,
        faceConfidence: 0.88,
        verifiedAt,
      },
      timeline: [
        {
          type: TimelineEventType.RFID_SCANNED,
          message: 'EPC EPC-001',
          metadata: null,
          occurredAt,
        },
      ],
      snapshots: [
        {
          id: 'snapshot-1',
          type: SnapshotType.PLATE,
          imageUrl: 'https://placeholder.local/plate.jpg',
        },
      ],
    });

    const response = await service.getTransactionById('event-1');

    expect(prisma.gateEvent.findUnique).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      include: transactionDetailInclude,
    });
    expect(response).toEqual({
      id: 'event-1',
      eventCode: 'GATE-20260617-0001',
      occurredAt,
      result: GateEventResult.VERIFIED,
      plateRead: 'ABC-123',
      plateMismatch: false,
      verification: {
        rfidMatched: true,
        plateMatched: true,
        faceMatched: true,
        plateConfidence: 0.96,
        faceConfidence: 0.88,
        verifiedAt,
      },
      timeline: [
        {
          type: TimelineEventType.RFID_SCANNED,
          message: 'EPC EPC-001',
          metadata: null,
          occurredAt,
        },
      ],
      rfidTag: {
        epcId: 'EPC-001',
        status: RFIDTagStatus.ACTIVE,
        assignedTruckPlate: 'ABC-123',
      },
      truck: {
        plateNumber: 'ABC-123',
        model: 'Mixer',
        assignedDriver: {
          firstName: 'Juan',
          lastName: 'Dela Cruz',
        },
      },
      truckInRegistry: true,
      driver: {
        id: 'driver-1',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
      },
      faceMatchesAssigned: true,
      snapshots: [
        {
          id: 'snapshot-1',
          type: SnapshotType.PLATE,
          imageUrl: 'https://placeholder.local/plate.jpg',
        },
      ],
      isOpen: true,
    });
  });

  it('throws when transaction detail is not found', async () => {
    prisma.gateEvent.findUnique.mockResolvedValue(null);

    await expect(service.getTransactionById('missing-event')).rejects.toThrow(NotFoundException);
  });
});
