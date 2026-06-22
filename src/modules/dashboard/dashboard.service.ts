import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { NEEDS_REVIEW_PREVIEW_LIMIT } from './constants/dashboard.constants';
import {
  buildHourlyThroughput,
  computeAvgPassTime,
  computePercentage,
  countExceptions,
  countVerified,
  toNeedsReviewItems,
} from './dashboard.mapper';
import { GetDashboardOverviewQueryDTO } from './dto/get-dashboard-overview-query.dto';
import { DashboardOverview, dashboardEventSelect } from './types/dashboard.types';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardOverview(query: GetDashboardOverviewQueryDTO): Promise<DashboardOverview> {
    const dayStart = this.resolveDayStart(query.date);
    const dayEnd = this.addDays(dayStart, 1);
    const previousDayStart = this.addDays(dayStart, -1);

    // One day-window fetch drives every section (cards, hourly buckets, needs-review); a single
    // count covers the previous-day delta. The window is bounded, so loading the rows once and
    // aggregating in memory is cheaper and clearer than several groupBy round-trips.
    const [events, previousDayTrucks] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where: { occurredAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { occurredAt: 'desc' },
        select: dashboardEventSelect,
      }),
      this.prisma.gateEvent.count({
        where: { occurredAt: { gte: previousDayStart, lt: dayStart } },
      }),
    ]);

    const trucksToday = events.length;
    const verified = countVerified(events);
    const exceptions = countExceptions(events);

    return {
      date: this.formatLocalDate(dayStart),
      generatedAt: new Date(),
      cards: {
        trucksToday: { value: trucksToday, deltaVsYesterday: trucksToday - previousDayTrucks },
        verified: { value: verified, rate: computePercentage(verified, trucksToday) },
        exceptions: { value: exceptions },
        avgPassTime: computeAvgPassTime(events),
      },
      hourlyThroughput: buildHourlyThroughput(events),
      needsReview: {
        open: exceptions,
        items: toNeedsReviewItems(events, NEEDS_REVIEW_PREVIEW_LIMIT),
      },
    };
  }

  // Resolve the report window to the gate's local day. An explicit date is validated by the DTO
  // (YYYY-MM-DD); otherwise today is used. Built from local Y/M/D so the window and the hourly
  // bucketing (getHours) stay in the same timezone as the server/gate.
  private resolveDayStart(date?: string): Date {
    if (!date) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
