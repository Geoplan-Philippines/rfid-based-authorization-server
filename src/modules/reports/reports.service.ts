import { BadRequestException, Injectable } from '@nestjs/common';
import { addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfDay, startOfMonth } from 'date-fns';
import { TimelineEventType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { EXCEPTION_GATE_EVENT_RESULTS } from 'src/common/gate-events/gate-event.constants';
import { PrismaService } from '../../core/database/prisma.service';
import { EXCEPTIONS_REPORT_GATE_EVENT_SELECT, REPORT_GATE_EVENT_SELECT, REPORT_PREVIOUS_SUMMARY_EVENT_SELECT } from './constants/reports.constants';
import { GetDailySummaryQueryDTO } from './dto/get-daily-summary-query.dto';
import { GetExceptionsReportQueryDTO } from './dto/get-exceptions-report-query.dto';
import { GetMonthlyBreakdownQueryDTO } from './dto/get-monthly-breakdown-query.dto';
import { GetPeakHoursQueryDTO } from './dto/get-peak-hours-query.dto';
import {
  buildDailyHourlyThroughput,
  buildExceptionResultCounts,
  buildMonthlyBreakdownDays,
  buildPeakHourBuckets,
  buildPreviousReportSummary,
  buildReportSummary,
  findPeakHourBuckets,
  toExceptionReportItem,
} from './reports.mapper';
import type { DailySummaryReport, ExceptionsReport, MonthlyBreakdownReport, PeakHoursReport, ReportGateEventPayload, ReportPeriod, ReportSummary } from './types/reports.types';

type ReportWindow = {
  start: Date;
  end: Date;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailySummaryReport(query: GetDailySummaryQueryDTO): Promise<DailySummaryReport> {
    const dayStart = this.resolveDayStart(query.date);
    const dayEnd = addDays(dayStart, 1);
    const { events, summary } = await this.getReportWindowData(
      { start: dayStart, end: dayEnd },
      { start: addDays(dayStart, -1), end: dayStart },
    );

    return {
      date: format(dayStart, 'yyyy-MM-dd'),
      title: `Daily Gate Summary — ${format(dayStart, 'EEEE, MMMM d, yyyy')}`,
      generatedAt: new Date(),
      summary,
      hourlyThroughput: buildDailyHourlyThroughput(events),
    };
  }

  async getMonthlyBreakdownReport(query: GetMonthlyBreakdownQueryDTO): Promise<MonthlyBreakdownReport> {
    const monthStart = this.resolveMonthStart(query.month);
    const monthEnd = addMonths(monthStart, 1);
    const previousMonthStart = addMonths(monthStart, -1);
    const { events, summary } = await this.getReportWindowData(
      { start: monthStart, end: monthEnd },
      { start: previousMonthStart, end: monthStart },
    );

    return {
      month: format(monthStart, 'yyyy-MM'),
      generatedAt: new Date(),
      summary,
      days: buildMonthlyBreakdownDays(
        events,
        eachDayOfInterval({ start: monthStart, end: addDays(monthEnd, -1) }),
      ),
    };
  }

  async getExceptionsReport(query: GetExceptionsReportQueryDTO): Promise<ExceptionsReport> {
    const { start, end } = this.resolveDateRange(query.from, query.to, 7);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildExceptionsWhere(start, end, query);
    const countsWhere = this.buildExceptionsWhere(start, end, query, { includeResult: false });
    const openCountWhere: Prisma.GateEventWhereInput = {
      AND: [
        countsWhere,
        { timeline: { none: { type: TimelineEventType.BARRIER_OPENED } } },
      ],
    };

    const [events, total, resultRows, openCount] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        select: EXCEPTIONS_REPORT_GATE_EVENT_SELECT,
      }),
      this.prisma.gateEvent.count({ where }),
      this.prisma.gateEvent.groupBy({
        by: ['result'],
        where: countsWhere,
        _count: { _all: true },
      }),
      this.prisma.gateEvent.count({ where: openCountWhere }),
    ]);

    return {
      data: events.map((event) => toExceptionReportItem(event)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        period: this.toReportPeriod(start, end),
        resultCounts: buildExceptionResultCounts(resultRows),
        openCount,
      },
    };
  }

  async getPeakHoursReport(query: GetPeakHoursQueryDTO): Promise<PeakHoursReport> {
    const { start, end } = this.resolveDateRange(query.from, query.to, 30);
    const periodDays = differenceInCalendarDays(end, start);
    const { events, summary } = await this.getReportWindowData(
      { start, end },
      { start: addDays(start, -periodDays), end: start },
    );
    const hours = buildPeakHourBuckets(events);

    return {
      period: this.toReportPeriod(start, end),
      generatedAt: new Date(),
      summary,
      hours,
      peakHours: findPeakHourBuckets(hours),
    };
  }

  private buildEventWindowWhere(start: Date, end: Date): Prisma.GateEventWhereInput {
    return { occurredAt: { gte: start, lt: end } };
  }

  private buildExceptionsWhere(
    start: Date,
    end: Date,
    query: GetExceptionsReportQueryDTO,
    options: { includeResult?: boolean } = {},
  ): Prisma.GateEventWhereInput {
    const includeResult = options.includeResult ?? true;
    const filters: Prisma.GateEventWhereInput[] = [
      this.buildEventWindowWhere(start, end),
      { result: { in: [...EXCEPTION_GATE_EVENT_RESULTS] } },
    ];
    const search = query.search?.trim();

    if (search) filters.push(this.buildExceptionSearchWhere(search));
    if (includeResult && query.result) filters.push({ result: query.result });

    return { AND: filters };
  }

  private buildExceptionSearchWhere(search: string): Prisma.GateEventWhereInput {
    const driverNameTerms = search.split(/\s+/).filter(Boolean);

    return {
      OR: [
        { eventCode: { contains: search, mode: 'insensitive' } },
        { plateNumberRead: { contains: search, mode: 'insensitive' } },
        { rfidTag: { is: { epcId: { contains: search, mode: 'insensitive' } } } },
        { truck: { is: { plateNumber: { contains: search, mode: 'insensitive' } } } },
        {
          driver: {
            is: {
              AND: driverNameTerms.map((term) => ({
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                ],
              })),
            },
          },
        },
      ],
    };
  }
  private async getReportWindowData(
    current: ReportWindow,
    previous: ReportWindow,
  ): Promise<{ events: ReportGateEventPayload[]; summary: ReportSummary }> {
    const [events, previousEvents, historicalEventCount] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where: this.buildEventWindowWhere(current.start, current.end),
        select: REPORT_GATE_EVENT_SELECT,
      }),
      this.prisma.gateEvent.findMany({
        where: this.buildEventWindowWhere(previous.start, previous.end),
        select: REPORT_PREVIOUS_SUMMARY_EVENT_SELECT,
      }),
      this.prisma.gateEvent.count({ where: { occurredAt: { lt: current.start } } }),
    ]);

    return {
      events,
      summary: buildReportSummary(events, historicalEventCount > 0 ? buildPreviousReportSummary(previousEvents) : null),
    };
  }

  private resolveDayStart(date?: string): Date {
    return startOfDay(date ? parseISO(date) : new Date());
  }

  private resolveMonthStart(month?: string): Date {
    return startOfMonth(month ? parseISO(`${month}-01`) : new Date());
  }

  private resolveDateRange(from: string | undefined, to: string | undefined, defaultDays: number): { start: Date; end: Date } {
    if (from && to) {
      const start = startOfDay(parseISO(from));
      const end = addDays(startOfDay(parseISO(to)), 1);
      this.ensureValidDateRange(start, end);
      return { start, end };
    }

    if (from) {
      const start = startOfDay(parseISO(from));
      const end = addDays(startOfDay(new Date()), 1);
      this.ensureValidDateRange(start, end);
      return { start, end };
    }

    if (to) {
      const toDayStart = startOfDay(parseISO(to));
      return {
        start: addDays(toDayStart, -(defaultDays - 1)),
        end: addDays(toDayStart, 1),
      };
    }

    const todayStart = startOfDay(new Date());
    return {
      start: addDays(todayStart, -(defaultDays - 1)),
      end: addDays(todayStart, 1),
    };
  }

  private ensureValidDateRange(start: Date, end: Date): void {
    if (start >= end) throw new BadRequestException('from must be on or before to');
  }

  private toReportPeriod(start: Date, end: Date): ReportPeriod {
    return {
      from: format(start, 'yyyy-MM-dd'),
      to: format(addDays(end, -1), 'yyyy-MM-dd'),
    };
  }
}
