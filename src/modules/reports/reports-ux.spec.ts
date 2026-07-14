import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GateEventResult, TimelineEventType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/database/prisma.service';
import { GetExceptionsReportQueryDTO } from './dto/get-exceptions-report-query.dto';
import { buildDailyHourlyThroughput } from './reports.mapper';
import { ReportsService } from './reports.service';

describe('report UX enhancements', () => {
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

  it('accepts only exception result filters and normalizes their casing', async () => {
    const accepted = plainToInstance(GetExceptionsReportQueryDTO, { result: 'unknown_tag' });
    const rejected = plainToInstance(GetExceptionsReportQueryDTO, { result: 'manual_override' });

    expect(accepted.result).toBe(GateEventResult.UNKNOWN_TAG);
    expect(await validate(accepted)).toHaveLength(0);
    expect((await validate(rejected)).map((error) => error.property)).toContain('result');
  });

  it('returns 24 daily throughput buckets and keeps overrides out of exception throughput', () => {
    const hourlyThroughput = buildDailyHourlyThroughput([
      { occurredAt: new Date(2026, 6, 14, 8, 0, 0), result: GateEventResult.VERIFIED, timeline: [] },
      { occurredAt: new Date(2026, 6, 14, 8, 15, 0), result: GateEventResult.UNKNOWN_TAG, timeline: [] },
      { occurredAt: new Date(2026, 6, 14, 8, 30, 0), result: GateEventResult.MANUAL_OVERRIDE, timeline: [] },
      { occurredAt: new Date(2026, 6, 14, 23, 0, 0), result: GateEventResult.DENIED, timeline: [] },
    ]);

    expect(hourlyThroughput.map((bucket) => bucket.hour)).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(hourlyThroughput[8]).toEqual({ hour: 8, verified: 1, exception: 1, total: 3 });
    expect(hourlyThroughput[23]).toEqual({ hour: 23, verified: 0, exception: 1, total: 1 });
    expect(hourlyThroughput[0]).toEqual({ hour: 0, verified: 0, exception: 0, total: 0 });
  });

  it('filters exception rows by result while keeping result counts and open count search-wide', async () => {
    prisma.gateEvent.findMany.mockResolvedValue([]);
    prisma.gateEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    prisma.gateEvent.groupBy.mockResolvedValue([
      { result: GateEventResult.UNKNOWN_TAG, _count: { _all: 3 } },
      { result: GateEventResult.DENIED, _count: { _all: 1 } },
    ]);

    const response = await service.getExceptionsReport({
      from: '2026-07-08',
      to: '2026-07-14',
      page: 2,
      limit: 2,
      result: GateEventResult.UNKNOWN_TAG,
      search: 'Ramon Reyes',
    });

    const listWhere = prisma.gateEvent.findMany.mock.calls[0][0].where;
    const countsWhere = prisma.gateEvent.groupBy.mock.calls[0][0].where;

    expect(listWhere.AND).toEqual(expect.arrayContaining([
      { result: GateEventResult.UNKNOWN_TAG },
      {
        OR: expect.arrayContaining([
          {
            driver: {
              is: {
                AND: [
                  {
                    OR: [
                      { firstName: { contains: 'Ramon', mode: 'insensitive' } },
                      { lastName: { contains: 'Ramon', mode: 'insensitive' } },
                    ],
                  },
                  {
                    OR: [
                      { firstName: { contains: 'Reyes', mode: 'insensitive' } },
                      { lastName: { contains: 'Reyes', mode: 'insensitive' } },
                    ],
                  },
                ],
              },
            },
          },
        ]),
      },
    ]));
    expect(countsWhere.AND).not.toContainEqual({ result: GateEventResult.UNKNOWN_TAG });
    expect(prisma.gateEvent.count.mock.calls[1][0].where).toEqual({
      AND: [
        countsWhere,
        { timeline: { none: { type: TimelineEventType.BARRIER_OPENED } } },
      ],
    });
    expect(response.meta).toMatchObject({
      total: 3,
      page: 2,
      limit: 2,
      lastPage: 2,
      resultCounts: { UNKNOWN_TAG: 3, DENIED: 1 },
      openCount: 2,
    });
  });

  it('uses the previous calendar month as the monthly comparison baseline', async () => {
    prisma.gateEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result: GateEventResult.VERIFIED }]);
    prisma.gateEvent.count.mockResolvedValue(1);

    const response = await service.getMonthlyBreakdownReport({ month: '2026-07' });

    expect(prisma.gateEvent.findMany.mock.calls[1][0]).toMatchObject({
      where: {
        occurredAt: {
          gte: new Date(2026, 5, 1),
          lt: new Date(2026, 6, 1),
        },
      },
    });
    expect(response.summary.previous).toEqual({
      totalGateEvents: 1,
      verified: 1,
      exceptions: 0,
      manualOverrides: 0,
      verificationRate: 100,
    });
  });

  it('uses null for a first-ever report and zero metrics for an empty immediate prior period', async () => {
    prisma.gateEvent.findMany.mockResolvedValue([]);
    prisma.gateEvent.count.mockResolvedValue(0);

    const firstReport = await service.getDailySummaryReport({ date: '2026-07-14' });

    expect(firstReport.summary.previous).toBeNull();

    prisma.gateEvent.count.mockResolvedValue(1);

    const laterReport = await service.getDailySummaryReport({ date: '2026-07-14' });

    expect(laterReport.summary.previous).toEqual({
      totalGateEvents: 0,
      verified: 0,
      exceptions: 0,
      manualOverrides: 0,
      verificationRate: 0,
    });
  });
});
