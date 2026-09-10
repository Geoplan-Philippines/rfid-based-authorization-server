import { GateEventResult, TimelineEventType } from '@prisma/client';
import { format } from 'date-fns';

import { EXCEPTION_GATE_EVENT_RESULTS, isExceptionGateEventResult } from 'src/common/gate-events/gate-event.constants';
import { REPORT_HOURS_PER_DAY } from './constants/reports.constants';
import type {
  AveragePassTime,
  DailyHourlyThroughputBucket,
  ExceptionGateEventResultCounts,
  ExceptionReportGateEventPayload,
  ExceptionReportItem,
  GateEventResultCounts,
  MonthlyBreakdownDay,
  PeakHourBucket,
  PreviousReportSummary,
  PreviousReportSummaryEventPayload,
  ReportGateEventPayload,
  ReportSummary,
} from './types/reports.types';

export function buildReportSummary(
  events: ReportGateEventPayload[],
  previous: PreviousReportSummary | null = null,
): ReportSummary {
  const resultCounts = createEmptyGateEventResultCounts();

  for (const event of events) {
    resultCounts[event.result] += 1;
  }

  const totalGateEvents = events.length;
  const verified = resultCounts[GateEventResult.VERIFIED];
  const exceptions = EXCEPTION_GATE_EVENT_RESULTS.reduce((total, result) => total + resultCounts[result], 0);

  return {
    totalGateEvents,
    verified,
    exceptions,
    manualOverrides: resultCounts[GateEventResult.MANUAL_OVERRIDE],
    openEvents: events.filter((event) => !findTimelineTime(event, TimelineEventType.BARRIER_OPENED)).length,
    verificationRate: calculatePercentage(verified, totalGateEvents),
    avgPassTime: calculateAveragePassTime(events),
    resultCounts,
    previous,
  };
}
export function buildPreviousReportSummary(
  events: PreviousReportSummaryEventPayload[],
): PreviousReportSummary {
  const resultCounts = createEmptyGateEventResultCounts();

  for (const event of events) {
    resultCounts[event.result] += 1;
  }

  const totalGateEvents = events.length;
  const verified = resultCounts[GateEventResult.VERIFIED];
  const exceptions = EXCEPTION_GATE_EVENT_RESULTS.reduce((total, result) => total + resultCounts[result], 0);

  return {
    totalGateEvents,
    verified,
    exceptions,
    manualOverrides: resultCounts[GateEventResult.MANUAL_OVERRIDE],
    verificationRate: calculatePercentage(verified, totalGateEvents),
  };
}


export function buildMonthlyBreakdownDays(events: ReportGateEventPayload[], days: Date[]): MonthlyBreakdownDay[] {
  const eventsByDate = new Map<string, ReportGateEventPayload[]>();

  for (const event of events) {
    const date = format(event.occurredAt, 'yyyy-MM-dd');
    const currentEvents = eventsByDate.get(date) ?? [];
    currentEvents.push(event);
    eventsByDate.set(date, currentEvents);
  }

  return days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    const { previous: _previous, ...summary } = buildReportSummary(eventsByDate.get(date) ?? []);
    return { date, ...summary };
  });
}

export function buildDailyHourlyThroughput(events: ReportGateEventPayload[]): DailyHourlyThroughputBucket[] {
  const buckets: DailyHourlyThroughputBucket[] = Array.from({ length: REPORT_HOURS_PER_DAY }, (_, hour) => ({
    hour,
    verified: 0,
    exception: 0,
    total: 0,
  }));

  for (const event of events) {
    const bucket = buckets[event.occurredAt.getHours()];
    bucket.total += 1;

    if (event.result === GateEventResult.VERIFIED) bucket.verified += 1;
    else if (isExceptionGateEventResult(event.result)) bucket.exception += 1;
  }

  return buckets;
}
export function buildPeakHourBuckets(events: ReportGateEventPayload[]): PeakHourBucket[] {
  const buckets: PeakHourBucket[] = Array.from({ length: REPORT_HOURS_PER_DAY }, (_, hour) => ({
    hour,
    label: formatHourRange(hour),
    totalGateEvents: 0,
    verified: 0,
    exceptions: 0,
    manualOverrides: 0,
  }));

  for (const event of events) {
    const bucket = buckets[event.occurredAt.getHours()];
    bucket.totalGateEvents += 1;

    if (event.result === GateEventResult.VERIFIED) bucket.verified += 1;
    else if (event.result === GateEventResult.MANUAL_OVERRIDE) bucket.manualOverrides += 1;
    else if (isExceptionGateEventResult(event.result)) bucket.exceptions += 1;
  }

  return buckets;
}

export function findPeakHourBuckets(hours: PeakHourBucket[]): PeakHourBucket[] {
  const maximum = Math.max(...hours.map((hour) => hour.totalGateEvents));
  return maximum === 0 ? [] : hours.filter((hour) => hour.totalGateEvents === maximum);
}

export function buildExceptionResultCounts(
  rows: Array<{ result: GateEventResult; _count: { _all: number } }>,
): ExceptionGateEventResultCounts {
  const counts = createEmptyExceptionGateEventResultCounts();

  for (const row of rows) {
    if (isExceptionGateEventResult(row.result)) counts[row.result] = row._count._all;
  }

  return counts;
}

export function toExceptionReportItem(event: ExceptionReportGateEventPayload): ExceptionReportItem {
  if (!isExceptionGateEventResult(event.result)) {
    throw new Error(`Cannot map ${event.result} as an exception report item`);
  }

  const barrierOpenedAt = event.timeline[0]?.occurredAt ?? null;

  return {
    id: event.id,
    eventCode: event.eventCode,
    occurredAt: event.occurredAt,
    result: event.result,
    reason: getExceptionReason(event.result),
    plateRead: event.plateNumberRead,
    rfidTag: event.rfidTag,
    truck: event.truck,
    driver: event.driver,
    verification: event.verification,
    barrierOpenedAt,
    isOpen: barrierOpenedAt === null,
  };
}

function createEmptyGateEventResultCounts(): GateEventResultCounts {
  return Object.values(GateEventResult).reduce((counts, result) => {
    counts[result] = 0;
    return counts;
  }, {} as GateEventResultCounts);
}

function createEmptyExceptionGateEventResultCounts(): ExceptionGateEventResultCounts {
  return EXCEPTION_GATE_EVENT_RESULTS.reduce((counts, result) => {
    counts[result] = 0;
    return counts;
  }, {} as ExceptionGateEventResultCounts);
}

function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function calculateAveragePassTime(events: ReportGateEventPayload[]): AveragePassTime {
  const durations: number[] = [];

  for (const event of events) {
    const rfidScannedAt = findTimelineTime(event, TimelineEventType.RFID_SCANNED);
    const barrierOpenedAt = findTimelineTime(event, TimelineEventType.BARRIER_OPENED);
    if (!rfidScannedAt || !barrierOpenedAt) continue;

    const duration = barrierOpenedAt.getTime() - rfidScannedAt.getTime();
    if (duration >= 0) durations.push(duration);
  }

  if (durations.length === 0) return { milliseconds: null, sampleSize: 0 };

  return {
    milliseconds: Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length),
    sampleSize: durations.length,
  };
}

function findTimelineTime(event: ReportGateEventPayload, type: TimelineEventType): Date | null {
  return event.timeline.find((timelineEvent) => timelineEvent.type === type)?.occurredAt ?? null;
}

function formatHourRange(hour: number): string {
  const start = format(new Date(2000, 0, 1, hour), 'h a');
  const end = format(new Date(2000, 0, 1, (hour + 1) % REPORT_HOURS_PER_DAY), 'h a');
  return `${start}–${end}`;
}

function getExceptionReason(result: GateEventResult): string {
  switch (result) {
    case GateEventResult.UNKNOWN_TAG:
      return 'The RFID tag is not registered.';
    case GateEventResult.FACE_MISMATCH:
      return 'The recognised driver does not match the truck assignment.';
    case GateEventResult.PLATE_MISMATCH:
      return 'The read plate does not match the bound truck.';
    case GateEventResult.DENIED:
      return 'The RFID tag is not active for authorization.';
    case GateEventResult.BANNED:
      return 'A banned truck or driver presented at the gate.';
    case GateEventResult.ERROR:
      return 'The authorization pipeline reported an error.';
    default:
      return 'The gate event requires operator review.';
  }
}
