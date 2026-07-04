import { GateEventResult, TimelineEventType } from '@prisma/client';

import {
  buildHourlyThroughput,
  computeAvgPassTime,
  computePercentage,
  countExceptions,
  countVerified,
  toNeedsReviewItems,
} from './dashboard.mapper';
import { DashboardEventPayload } from './types/dashboard.types';

type TimelineSeed = { type: TimelineEventType; occurredAt: Date };

function makeEvent(overrides: Partial<DashboardEventPayload> = {}): DashboardEventPayload {
  return {
    id: 'event-id',
    eventCode: 'GATE-20260621-0001',
    occurredAt: new Date('2026-06-21T08:00:00'),
    result: GateEventResult.VERIFIED,
    timeline: [],
    ...overrides,
  };
}

function withPassTimeline(scannedAt: Date, openedAt: Date): TimelineSeed[] {
  return [
    { type: TimelineEventType.RFID_SCANNED, occurredAt: scannedAt },
    { type: TimelineEventType.BARRIER_OPENED, occurredAt: openedAt },
  ];
}

describe('dashboard.mapper', () => {
  describe('countVerified / countExceptions', () => {
    const events = [
      makeEvent({ result: GateEventResult.VERIFIED }),
      makeEvent({ result: GateEventResult.MANUAL_OVERRIDE }),
      makeEvent({ result: GateEventResult.PLATE_MISMATCH }),
      makeEvent({ result: GateEventResult.UNKNOWN_TAG }),
    ];

    it('counts only VERIFIED passes', () => {
      expect(countVerified(events)).toBe(1);
    });

    it('counts exception results, excluding VERIFIED and MANUAL_OVERRIDE', () => {
      expect(countExceptions(events)).toBe(2);
    });
  });

  describe('computePercentage', () => {
    it('returns one-decimal percentage', () => {
      expect(computePercentage(136, 142)).toBe(95.8);
    });

    it('returns 0 for an empty window instead of dividing by zero', () => {
      expect(computePercentage(0, 0)).toBe(0);
    });
  });

  describe('buildHourlyThroughput', () => {
    it('produces 24 buckets indexed by gate-local hour', () => {
      const buckets = buildHourlyThroughput([]);
      expect(buckets).toHaveLength(24);
      expect(buckets[0]).toEqual({ hour: 0, verified: 0, exception: 0, total: 0 });
    });

    it('splits each hour into verified vs exception, counting overrides only in total', () => {
      const buckets = buildHourlyThroughput([
        makeEvent({ occurredAt: new Date('2026-06-21T08:15:00'), result: GateEventResult.VERIFIED }),
        makeEvent({ occurredAt: new Date('2026-06-21T08:45:00'), result: GateEventResult.FACE_MISMATCH }),
        makeEvent({ occurredAt: new Date('2026-06-21T08:50:00'), result: GateEventResult.MANUAL_OVERRIDE }),
      ]);

      expect(buckets[8]).toEqual({ hour: 8, verified: 1, exception: 1, total: 3 });
    });

    it('excludes IN_PROGRESS events entirely so the residual is not misread as an override', () => {
      const buckets = buildHourlyThroughput([
        makeEvent({ occurredAt: new Date('2026-06-21T08:15:00'), result: GateEventResult.VERIFIED }),
        makeEvent({ occurredAt: new Date('2026-06-21T08:30:00'), result: GateEventResult.IN_PROGRESS }),
      ]);

      expect(buckets[8]).toEqual({ hour: 8, verified: 1, exception: 0, total: 1 });
    });
  });

  describe('computeAvgPassTime', () => {
    it('averages RFID→barrier durations across completed passes only', () => {
      const result = computeAvgPassTime([
        makeEvent({
          timeline: withPassTimeline(new Date('2026-06-21T08:00:00.000'), new Date('2026-06-21T08:00:01.000')),
        }),
        makeEvent({
          timeline: withPassTimeline(new Date('2026-06-21T09:00:00.000'), new Date('2026-06-21T09:00:03.000')),
        }),
        // No barrier event yet — ignored, not treated as a zero-duration sample.
        makeEvent({ timeline: [{ type: TimelineEventType.RFID_SCANNED, occurredAt: new Date('2026-06-21T10:00:00') }] }),
      ]);

      expect(result).toEqual({ milliseconds: 2000, sampleSize: 2 });
    });

    it('returns a null average when no pass completed', () => {
      expect(computeAvgPassTime([makeEvent({ timeline: [] })])).toEqual({ milliseconds: null, sampleSize: 0 });
    });
  });

  describe('toNeedsReviewItems', () => {
    it('keeps only exceptions, preserves newest-first order, and caps to the limit', () => {
      const events = [
        makeEvent({ id: 'a', result: GateEventResult.VERIFIED }),
        makeEvent({ id: 'b', result: GateEventResult.PLATE_MISMATCH }),
        makeEvent({ id: 'c', result: GateEventResult.FACE_MISMATCH }),
        makeEvent({ id: 'd', result: GateEventResult.UNKNOWN_TAG }),
      ];

      const items = toNeedsReviewItems(events, 2);

      expect(items.map((item) => item.id)).toEqual(['b', 'c']);
    });
  });
});
