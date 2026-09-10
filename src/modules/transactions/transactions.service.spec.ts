import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GateEventResult, RFIDTagStatus, SnapshotType, TimelineEventType } from '@prisma/client';

import { BAN_ENTITY_TYPE, BAN_TYPE } from 'src/common/bans/ban.constants';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../email/email.service';
import { TransactionsService } from './transactions.service';
import { transactionDetailInclude } from './types/transactions.types';

jest.mock('src/core/config/env.config', () => ({
  env: {
    TRANSACTION_ALERT_RECIPIENTS: ['ops@example.com'],
  },
}));

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    $transaction: jest.Mock;
    gateEvent: Record<string, jest.Mock>;
    rFIDTag: { findUnique: jest.Mock };
    driver: { findUnique: jest.Mock };
    eventVerification: { update: jest.Mock };
    gateTimelineEvent: { create: jest.Mock };
    gateSnapshot: { create: jest.Mock };
  };
  let emailService: {
    sendTransactionAlert: jest.Mock;
    sendBanPresentationAlert: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
      gateEvent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      rFIDTag: { findUnique: jest.fn() },
      driver: { findUnique: jest.fn() },
      eventVerification: { update: jest.fn().mockResolvedValue({}) },
      gateTimelineEvent: { create: jest.fn().mockResolvedValue({}) },
      gateSnapshot: { create: jest.fn().mockResolvedValue({}) },
    };
    emailService = {
      sendTransactionAlert: jest.fn().mockResolvedValue({ skipped: false }),
      sendBanPresentationAlert: jest.fn().mockResolvedValue({ id: 'email-1' }),
    };

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
      BANNED: 0,
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
    expect(response.result).toBe(GateEventResult.VERIFIED);
    expect(response.truckInRegistry).toBe(true);
  });

  it('throws when transaction detail is not found', async () => {
    prisma.gateEvent.findUnique.mockResolvedValue(null);

    await expect(service.getTransactionById('missing-event')).rejects.toThrow(NotFoundException);
  });

  it('records a banned truck presentation as BANNED and emails ops with ban type', async () => {
    const truck = {
      id: 'truck-1',
      plateNumber: 'ABC 123',
      model: 'Mixer',
      isPermanentlyBanned: true,
      bannedUntil: null,
    };

    prisma.rFIDTag.findUnique.mockResolvedValue({
      id: 'tag-1',
      epcId: 'EPC-001',
      status: RFIDTagStatus.ACTIVE,
      assignedTruck: truck,
    });
    prisma.gateEvent.create.mockImplementation(async ({ data }) => ({
      id: 'event-1',
      eventCode: data.eventCode,
      occurredAt: data.occurredAt,
      result: data.result,
      plateNumberRead: null,
      driverId: null,
      rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
      truck: { ...truck, driverAssignments: [] },
      driver: null,
      verification: {
        rfidMatched: true,
        plateMatched: null,
        faceMatched: null,
        plateConfidence: null,
        faceConfidence: null,
        verifiedAt: data.occurredAt,
      },
      timeline: data.timeline.create,
      snapshots: [],
    }));

    const response = await service.recordRfidRead({ epcId: 'EPC-001' });

    expect(response.result).toBe(GateEventResult.BANNED);
    expect(response.isOpen).toBe(true);
    expect(prisma.gateEvent.create.mock.calls[0][0].data.timeline.create).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TimelineEventType.BANNED_ENTITY_DETECTED }),
      ]),
    );
    expect(emailService.sendBanPresentationAlert).toHaveBeenCalledWith({
      to: ['ops@example.com'],
      presentation: expect.objectContaining({
        entityType: BAN_ENTITY_TYPE.truck,
        subjectName: 'ABC 123',
        banType: BAN_TYPE.permanent,
        bannedUntil: null,
      }),
    });
    expect(emailService.sendTransactionAlert).not.toHaveBeenCalled();
  });

  it('treats an expired timed truck ban as normal verified RFID traffic', async () => {
    const truck = {
      id: 'truck-1',
      plateNumber: 'ABC 123',
      model: 'Mixer',
      isPermanentlyBanned: false,
      bannedUntil: new Date(2026, 8, 1),
    };

    prisma.rFIDTag.findUnique.mockResolvedValue({
      id: 'tag-1',
      epcId: 'EPC-001',
      status: RFIDTagStatus.ACTIVE,
      assignedTruck: truck,
    });
    prisma.gateEvent.create.mockImplementation(async ({ data }) => ({
      id: 'event-1',
      eventCode: data.eventCode,
      occurredAt: data.occurredAt,
      result: data.result,
      plateNumberRead: null,
      driverId: null,
      rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
      truck: { ...truck, driverAssignments: [] },
      driver: null,
      verification: {
        rfidMatched: true,
        plateMatched: null,
        faceMatched: null,
        plateConfidence: null,
        faceConfidence: null,
        verifiedAt: data.occurredAt,
      },
      timeline: data.timeline.create,
      snapshots: [],
    }));

    const response = await service.recordRfidRead({ epcId: 'EPC-001' });

    expect(response.result).toBe(GateEventResult.VERIFIED);
    expect(emailService.sendBanPresentationAlert).not.toHaveBeenCalled();
  });

  it('does not auto-open when a banned driver presents, and emails ops with until-date ban type', async () => {
    const bannedUntil = new Date(2026, 11, 31);
    prisma.gateEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      rfidTag: { id: 'tag-1', status: RFIDTagStatus.ACTIVE },
      truck: {
        id: 'truck-1',
        plateNumber: 'ABC 123',
        isPermanentlyBanned: false,
        bannedUntil: null,
        driverAssignments: [{ driverId: 'driver-1' }],
      },
      driver: null,
      verification: { rfidMatched: true, plateMatched: true, faceMatched: null },
    });
    prisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      driverId: 'DRV-00001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      licenseNumber: 'N01-23-456789',
      isPermanentlyBanned: false,
      bannedUntil,
    });
    prisma.gateEvent.update.mockResolvedValue({});
    prisma.gateEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      eventCode: 'GATE-banned1',
      occurredAt: new Date('2026-09-09T01:00:00.000Z'),
      result: GateEventResult.BANNED,
      plateNumberRead: 'ABC 123',
      driverId: 'driver-1',
      rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
      truck: { plateNumber: 'ABC 123', model: 'Mixer', driverAssignments: [] },
      driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Dela Cruz' },
      verification: {
        rfidMatched: true,
        plateMatched: true,
        faceMatched: true,
        plateConfidence: 0.96,
        faceConfidence: 0.88,
        verifiedAt: new Date('2026-09-09T01:00:00.000Z'),
      },
      timeline: [{ type: TimelineEventType.RFID_SCANNED, message: 'EPC EPC-001', metadata: null, occurredAt: new Date() }],
      snapshots: [],
    });

    const response = await service.recordFaceRead({ driverId: 'DRV-00001' });

    expect(prisma.driver.findUnique).toHaveBeenCalledWith({
      where: { driverId: 'DRV-00001' },
    });
    expect(prisma.gateEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        driver: { connect: { id: 'driver-1' } },
      }),
    });

    expect(response.result).toBe(GateEventResult.BANNED);
    expect(prisma.gateTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: TimelineEventType.BANNED_ENTITY_DETECTED }),
    });
    expect(prisma.gateTimelineEvent.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ type: TimelineEventType.BARRIER_OPENED }),
    });
    expect(emailService.sendBanPresentationAlert).toHaveBeenCalledWith({
      to: ['ops@example.com'],
      presentation: expect.objectContaining({
        entityType: BAN_ENTITY_TYPE.driver,
        subjectName: 'Juan Dela Cruz',
        identifier: 'N01-23-456789',
        banType: BAN_TYPE.untilDate,
        bannedUntil,
      }),
    });
    expect(emailService.sendTransactionAlert).not.toHaveBeenCalled();
  });

  it('still auto-opens a plate mismatch on a valid unbanned tag and does not send a ban email', async () => {
    prisma.gateEvent.findFirst.mockResolvedValue({
      id: 'event-1',
      rfidTag: { id: 'tag-1', status: RFIDTagStatus.ACTIVE },
      truck: {
        id: 'truck-1',
        plateNumber: 'ABC 123',
        isPermanentlyBanned: false,
        bannedUntil: null,
        driverAssignments: [{ driverId: 'driver-1' }],
      },
      driver: null,
      verification: { rfidMatched: true, plateMatched: false, faceMatched: null },
    });
    prisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      driverId: 'DRV-00001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      licenseNumber: 'N01-23-456789',
      isPermanentlyBanned: false,
      bannedUntil: null,
    });
    prisma.gateEvent.update.mockResolvedValue({});
    prisma.gateEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      eventCode: 'GATE-mismatch',
      occurredAt: new Date('2026-09-09T01:00:00.000Z'),
      result: GateEventResult.PLATE_MISMATCH,
      plateNumberRead: 'XYZ 999',
      driverId: 'driver-1',
      rfidTag: { epcId: 'EPC-001', status: RFIDTagStatus.ACTIVE },
      truck: { plateNumber: 'ABC 123', model: 'Mixer', driverAssignments: [] },
      driver: { id: 'driver-1', firstName: 'Juan', lastName: 'Dela Cruz' },
      verification: {
        rfidMatched: true,
        plateMatched: false,
        faceMatched: true,
        plateConfidence: 0.96,
        faceConfidence: 0.88,
        verifiedAt: new Date('2026-09-09T01:00:00.000Z'),
      },
      timeline: [
        { type: TimelineEventType.RFID_SCANNED, message: 'EPC EPC-001', metadata: null, occurredAt: new Date() },
        { type: TimelineEventType.BARRIER_OPENED, message: 'RFID-only policy', metadata: null, occurredAt: new Date() },
      ],
      snapshots: [],
    });

    const response = await service.recordFaceRead({ driverId: 'DRV-00001' });

    expect(response.result).toBe(GateEventResult.PLATE_MISMATCH);
    expect(prisma.gateTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: TimelineEventType.BARRIER_OPENED }),
    });
    expect(emailService.sendTransactionAlert).toHaveBeenCalled();
    expect(emailService.sendBanPresentationAlert).not.toHaveBeenCalled();
  });
});
