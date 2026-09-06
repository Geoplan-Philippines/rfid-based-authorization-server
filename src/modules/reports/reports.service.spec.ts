import { BadRequestException } from '@nestjs/common';
import { GateEventResult } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/database/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    gateEvent: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      gateEvent: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the requested calendar day and returns a backend-built title', async () => {
    prisma.gateEvent.findMany.mockResolvedValue([]);

    const response = await service.getDailySummaryReport({ date: '2026-07-14' });

    expect(prisma.gateEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        occurredAt: {
          gte: new Date(2026, 6, 14),
          lt: new Date(2026, 6, 15),
        },
      },
    }));
    expect(response).toMatchObject({
      date: '2026-07-14',
      title: 'Daily Gate Summary — Tuesday, July 14, 2026',
      summary: { totalGateEvents: 0, openEvents: 0 },
    });
  });

  it('defaults the exceptions report to the inclusive last seven calendar days', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 14, 12, 0, 0));
    prisma.gateEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        eventCode: 'GATE-001',
        occurredAt: new Date(2026, 6, 14, 8, 0, 0),
        result: GateEventResult.PLATE_MISMATCH,
        plateNumberRead: 'ABC-123',
        rfidTag: null,
        truck: null,
        driver: null,
        verification: null,
        timeline: [],
      },
    ]);
    prisma.gateEvent.count.mockResolvedValue(1);
    prisma.gateEvent.groupBy.mockResolvedValue([
      { result: GateEventResult.PLATE_MISMATCH, _count: { _all: 1 } },
    ]);

    const response = await service.getExceptionsReport({ page: 1, limit: 20 });

    expect(prisma.gateEvent.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ AND: expect.any(Array) }));
    expect(response.meta).toMatchObject({
      period: { from: '2026-07-08', to: '2026-07-14' },
      resultCounts: { PLATE_MISMATCH: 1 },
    });
      1,
    expect(response.data[0]).toMatchObject({ result: GateEventResult.PLATE_MISMATCH, isOpen: true });
  });

  it('uses the preceding thirty calendar days when only the peak-hours end date is supplied', async () => {
    prisma.gateEvent.findMany.mockResolvedValue([]);

    const response = await service.getPeakHoursReport({ to: '2026-07-14' });

    expect(prisma.gateEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        occurredAt: {
          gte: new Date(2026, 5, 15),
          lt: new Date(2026, 6, 15),
        },
      },
    }));
    expect(response.period).toEqual({ from: '2026-06-15', to: '2026-07-14' });
    expect(response.hours).toHaveLength(24);
  });

  it('rejects a report range whose start date is after its end date', async () => {
    await expect(service.getPeakHoursReport({ from: '2026-07-15', to: '2026-07-14' })).rejects.toThrow(BadRequestException);
  });
});
