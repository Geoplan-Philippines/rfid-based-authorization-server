import { GateEventResult, TimelineEventType } from '@prisma/client';

import { HOURS_PER_DAY, isExceptionResult } from './constants/dashboard.constants';
import { DashboardEventPayload, HourlyThroughputBucket, NeedsReviewItem } from './types/dashboard.types';

// Pure aggregators that turn the day's gate-event rows into the dashboard's display shapes. Kept out
// of the service so they stay free of DB/DI concerns and are trivially unit-testable.

export function countVerified(events: DashboardEventPayload[]): number {
  return events.filter((event) => event.result === GateEventResult.VERIFIED).length;
}

export function countExceptions(events: DashboardEventPayload[]): number {
  return events.filter((event) => isExceptionResult(event.result)).length;
}

// part / total as a percentage rounded to one decimal. Guards against an empty window.
export function computePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// 24 buckets (one per gate-local hour), each split into verified vs exception. MANUAL_OVERRIDE
// counts toward total only — it is neither a clean pass nor an open exception.
export function buildHourlyThroughput(events: DashboardEventPayload[]): HourlyThroughputBucket[] {
  const buckets: HourlyThroughputBucket[] = Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({
    hour,
    verified: 0,
    exception: 0,
    total: 0,
  }));

  for (const event of events) {
    const bucket = buckets[event.occurredAt.getHours()];
    bucket.total += 1;
    if (event.result === GateEventResult.VERIFIED) bucket.verified += 1;
    else if (isExceptionResult(event.result)) bucket.exception += 1;
  }

  return buckets;
}

// Mean RFID→barrier duration in milliseconds across passes that actually opened the barrier.
// Returns null when no pass completed so the card can render an empty state instead of "0s".
export function computeAvgPassTime(events: DashboardEventPayload[]): { milliseconds: number | null; sampleSize: number } {
  const durations: number[] = [];

  for (const event of events) {
    const rfidScannedAt = findTimelineTime(event, TimelineEventType.RFID_SCANNED);
    const barrierOpenedAt = findTimelineTime(event, TimelineEventType.BARRIER_OPENED);
    if (!rfidScannedAt || !barrierOpenedAt) continue;

    const duration = barrierOpenedAt.getTime() - rfidScannedAt.getTime();
    if (duration >= 0) durations.push(duration);
  }

  if (durations.length === 0) return { milliseconds: null, sampleSize: 0 };

  const total = durations.reduce((sum, value) => sum + value, 0);
  return { milliseconds: Math.round(total / durations.length), sampleSize: durations.length };
}

// Most recent exceptions, capped for the preview panel. Expects events pre-sorted newest-first.
export function toNeedsReviewItems(events: DashboardEventPayload[], limit: number): NeedsReviewItem[] {
  return events
    .filter((event) => isExceptionResult(event.result))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      eventCode: event.eventCode,
      occurredAt: event.occurredAt,
      result: event.result,
    }));
}

function findTimelineTime(event: DashboardEventPayload, type: TimelineEventType): Date | null {
  return event.timeline.find((entry) => entry.type === type)?.occurredAt ?? null;
}
