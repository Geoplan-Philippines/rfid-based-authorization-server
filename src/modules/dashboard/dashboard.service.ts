import { Injectable } from '@nestjs/common';
import { addDays, format, parseISO, startOfDay } from 'date-fns';

import { PrismaService } from '../../core/database/prisma.service';
import { DASHBOARD_MAX_DAILY_EVENTS, NEEDS_REVIEW_PREVIEW_LIMIT } from './constants/dashboard.constants';
import { buildHourlyThroughput, computeAvgPassTime, computePercentage, countExceptions, countVerified, toNeedsReviewItems } from './dashboard.mapper';
import { GetDashboardOverviewQueryDTO } from './dto/get-dashboard-overview-query.dto';
import { DashboardOverview, dashboardEventSelect } from './types/dashboard.types';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardOverview(query: GetDashboardOverviewQueryDTO): Promise<DashboardOverview> {
    // Report window is the gate's local day: an explicit date (validated YYYY-MM-DD by the DTO) or
    // today. Local Y/M/D keeps the window and the hourly bucketing (getHours) in the server/gate
    // timezone. parseISO reads the date string as local midnight (native Date would treat it as UTC).
    const dayStart = startOfDay(query.date ? parseISO(query.date) : new Date());
    const dayEnd = addDays(dayStart, 1);
    const previousDayStart = addDays(dayStart, -1);

    // One day-window fetch drives every section (cards, hourly buckets, needs-review); a single
    // count covers the previous-day delta. The window is bounded, so loading the rows once and
    // aggregating in memory is cheaper and clearer than several groupBy round-trips.
    const [events, previousDayTrucks] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where: { occurredAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { occurredAt: 'desc' },
        select: dashboardEventSelect,
        take: DASHBOARD_MAX_DAILY_EVENTS,
      }),
      this.prisma.gateEvent.count({
        where: { occurredAt: { gte: previousDayStart, lt: dayStart } },
      }),
    ]);

    const trucksToday = events.length;
    const verified = countVerified(events);
    const exceptions = countExceptions(events);

    return {
      date: format(dayStart, 'yyyy-MM-dd'),
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
}
