import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AssignmentRole, GateEventResult, RFIDTagStatus, SnapshotType, TimelineEventType, TruckDriverAssignmentStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { env } from '../../core/config/env.config';
import { EmailService } from '../email/email.service';
import { TransactionsService } from './transactions.service';
import { boundFaceTransactionInclude, transactionDetailInclude } from './types/transactions.types';

type TransactionWhere = {
  AND: Array<{
    OR?: unknown[];
    result?: GateEventResult;
  }>;
};

type EventVerificationUpdateInput = {
  where: { gateEventId: string };
  data: {
    faceMatched?: boolean;
    faceConfidence?: number | null;
    verifiedAt?: Date;
  };
};

type TimelineCreateInput = {
  data: { type: TimelineEventType };
};

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    gateEvent: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      update: jest.Mock;
    };
    eventVerification: { update: jest.Mock };
    gateTimelineEvent: { create: jest.Mock };
    gateSnapshot: { create: jest.Mock };
    driver: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: { sendTransactionAlert: jest.Mock };

  beforeEach(async () => {
    prisma = {
      gateEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
      },
      eventVerification: { update: jest.fn() },
      gateTimelineEvent: { create: jest.fn() },
      gateSnapshot: { create: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    emailService = { sendTransactionAlert: jest.fn().mockResolvedValue({ skipped: true }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
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

    const listCalls = prisma.gateEvent.findMany.mock.calls as unknown as Array<[{ where: TransactionWhere }]>;
    const listArguments = listCalls[0][0];
    const listWhere = listArguments.where;
    expect(listWhere.AND).toContainEqual({ result: GateEventResult.VERIFIED });
    expect(listWhere.AND[0].OR).toEqual(expect.arrayContaining([
      { eventCode: { contains: 'ABC', mode: 'insensitive' } },
      { plateNumberRead: { contains: 'ABC', mode: 'insensitive' } },
      { rfidTag: { is: { epcId: { contains: 'ABC', mode: 'insensitive' } } } },
      { truck: { is: { plateNumber: { contains: 'ABC', mode: 'insensitive' } } } },
    ]));

    expect(prisma.gateEvent.count).toHaveBeenCalledWith({ where: listWhere });

    const countCalls = prisma.gateEvent.groupBy.mock.calls as unknown as Array<[{ where: TransactionWhere }]>;
    const countArguments = countCalls[0][0];
    const countsWhere = countArguments.where;
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
      faceRecognitionAttempts: [],
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
        assignedDrivers: [
          {
            firstName: 'Juan',
            lastName: 'Dela Cruz',
          },
        ],
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
      faceRecognition: null,
      isOpen: true,
    });
  });

  it('throws when transaction detail is not found', async () => {
    prisma.gateEvent.findUnique.mockResolvedValue(null);

    await expect(service.getTransactionById('missing-event')).rejects.toThrow(NotFoundException);
  });

  describe('recordFaceRead', () => {
    it('matches when the recognised driver holds the RELIEF assignment, not just PRIMARY (D1)', async () => {
      const occurredAt = new Date('2026-08-06T00:00:00.000Z');

      // Open transaction: truck has both a PRIMARY and a RELIEF active assignment.
      prisma.gateEvent.findFirst.mockResolvedValue({
        id: 'event-2',
        rfidTag: { id: 'tag-2', epcId: 'EPC-002', status: RFIDTagStatus.ACTIVE },
        truck: {
          id: 'truck-2',
          driverAssignments: [
            { truckId: 'truck-2', driverId: 'driver-primary', role: AssignmentRole.PRIMARY, status: TruckDriverAssignmentStatus.ACTIVE },
            { truckId: 'truck-2', driverId: 'driver-relief', role: AssignmentRole.RELIEF, status: TruckDriverAssignmentStatus.ACTIVE },
          ],
        },
        verification: { faceMatched: null, plateMatched: null },
      });
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-relief' });
      prisma.gateEvent.findUnique.mockResolvedValue({
        id: 'event-2',
        eventCode: 'GATE-0000002',
        occurredAt,
        result: GateEventResult.VERIFIED,
        plateNumberRead: null,
        driverId: 'driver-relief',
        rfidTag: { epcId: 'EPC-002', status: RFIDTagStatus.ACTIVE },
        truck: {
          plateNumber: 'DEF-456',
          model: null,
          driverAssignments: [
            { driverId: 'driver-primary', driver: { id: 'driver-primary', firstName: 'Primary', lastName: 'Driver' } },
            { driverId: 'driver-relief', driver: { id: 'driver-relief', firstName: 'Relief', lastName: 'Driver' } },
          ],
        },
        driver: { id: 'driver-relief', firstName: 'Relief', lastName: 'Driver' },
        verification: {
          rfidMatched: true,
          plateMatched: null,
          faceMatched: true,
          plateConfidence: null,
          faceConfidence: 0.9,
          verifiedAt: occurredAt,
        },
        timeline: [],
        snapshots: [],
        faceRecognitionAttempts: [],
      });

      const response = await service.recordFaceRead({ driverId: 'driver-relief', faceConfidence: 0.9 });

      // The RELIEF driver is a member of the active-assignment set, so the service computes a match
      // (this is the D1 fix: membership in the full set, not equality with an arbitrary single row).
      const updateCalls = prisma.eventVerification.update.mock.calls as unknown as Array<[EventVerificationUpdateInput]>;
      const updateInput = updateCalls[0][0];
      expect(updateInput.where).toEqual({ gateEventId: 'event-2' });
      expect(updateInput.data.faceMatched).toBe(true);
      expect(updateInput.data.faceConfidence).toBe(0.9);
      expect(updateInput.data.verifiedAt).toBeInstanceOf(Date);
      expect(response.faceMatchesAssigned).toBe(true);
    });

    it('binds an asynchronous face result to its explicit gate event instead of FIFO lookup (D3)', async () => {
      const occurredAt = new Date('2026-08-06T00:00:00.000Z');
      prisma.gateEvent.findUnique
        .mockResolvedValueOnce({
          id: 'bound-event',
          rfidTag: { id: 'tag-1', epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
          truck: {
            id: 'truck-1',
            driverAssignments: [
              { driverId: 'driver-1', role: AssignmentRole.PRIMARY, status: TruckDriverAssignmentStatus.ACTIVE },
            ],
          },
          verification: { faceMatched: null, plateMatched: true },
          timeline: [],
        })
        .mockResolvedValueOnce({
          id: 'bound-event',
          eventCode: 'GATE-BOUND',
          occurredAt,
          result: GateEventResult.VERIFIED,
          plateNumberRead: 'ABC-123',
          driverId: 'driver-1',
          rfidTag: { epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
          truck: {
            plateNumber: 'ABC-123',
            model: null,
            driverAssignments: [
              { driverId: 'driver-1', driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' } },
            ],
          },
          driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' },
          verification: {
            rfidMatched: true,
            plateMatched: true,
            faceMatched: true,
            plateConfidence: 0.9,
            faceConfidence: 0.8,
            verifiedAt: occurredAt,
          },
          timeline: [],
          snapshots: [],
          faceRecognitionAttempts: [],
        });
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });

      await service.recordFaceReadForEvent('bound-event', {
        attemptId: 'attempt-1',
        driverId: 'driver-1',
        faceConfidence: 0.8,
      });

      expect(prisma.gateEvent.findFirst).not.toHaveBeenCalled();
      expect(prisma.gateEvent.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 'bound-event' },
        include: boundFaceTransactionInclude,
      });
      const updateCalls = prisma.eventVerification.update.mock.calls as unknown as Array<[EventVerificationUpdateInput]>;
      const updateInput = updateCalls[0][0];
      expect(updateInput.where).toEqual({ gateEventId: 'bound-event' });
      expect(updateInput.data.faceMatched).toBe(true);
      expect(updateInput.data.faceConfidence).toBe(0.8);
      expect(updateInput.data.verifiedAt).toBeInstanceOf(Date);
    });

    it('keeps the valid-RFID auto-open policy for an ACTIVE face mismatch when blocking is off', async () => {
      const occurredAt = new Date('2026-08-06T00:00:00.000Z');
      const originalBlockSetting = env.FACE_BLOCK_BARRIER_ON_MISMATCH;
      env.FACE_BLOCK_BARRIER_ON_MISMATCH = false;
      prisma.gateEvent.findUnique
        .mockResolvedValueOnce({
          id: 'mismatch-event',
          rfidTag: { id: 'tag-1', epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
          truck: {
            id: 'truck-1',
            driverAssignments: [
              { driverId: 'driver-1', role: AssignmentRole.PRIMARY, status: TruckDriverAssignmentStatus.ACTIVE },
            ],
          },
          verification: { faceMatched: null, plateMatched: null },
          timeline: [],
        })
        .mockResolvedValueOnce({
          id: 'mismatch-event',
          eventCode: 'GATE-MISMATCH',
          occurredAt,
          result: GateEventResult.FACE_MISMATCH,
          plateNumberRead: null,
          driverId: null,
          rfidTag: { epcId: 'EPC-1', status: RFIDTagStatus.ACTIVE },
          truck: {
            plateNumber: 'ABC-123',
            model: null,
            driverAssignments: [
              { driverId: 'driver-1', driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Cruz' } },
            ],
          },
          driver: null,
          verification: {
            rfidMatched: true,
            plateMatched: null,
            faceMatched: false,
            plateConfidence: null,
            faceConfidence: null,
            verifiedAt: occurredAt,
          },
          timeline: [
            {
              type: TimelineEventType.BARRIER_OPENED,
              message: 'RFID-only policy',
              metadata: null,
              occurredAt,
            },
          ],
          snapshots: [],
          faceRecognitionAttempts: [],
        });

      try {
        await service.recordFaceReadForEvent('mismatch-event', { attemptId: 'attempt-1' });
      } finally {
        env.FACE_BLOCK_BARRIER_ON_MISMATCH = originalBlockSetting;
      }

      const updateCalls = prisma.eventVerification.update.mock.calls as unknown as Array<[EventVerificationUpdateInput]>;
      expect(updateCalls[0][0].data.faceMatched).toBe(false);
      expect(updateCalls[0][0].data.verifiedAt).toBeInstanceOf(Date);
      const timelineCalls = prisma.gateTimelineEvent.create.mock.calls as unknown as Array<[TimelineCreateInput]>;
      expect(timelineCalls.map(([input]) => input.data.type)).toContain(TimelineEventType.BARRIER_OPENED);
    });
  });
});
