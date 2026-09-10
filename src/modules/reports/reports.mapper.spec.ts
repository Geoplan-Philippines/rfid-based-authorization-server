import { GateEventResult, TimelineEventType } from '@prisma/client';

import { buildExceptionResultCounts, buildMonthlyBreakdownDays, buildPeakHourBuckets, buildReportSummary, findPeakHourBuckets, toExceptionReportItem } from './reports.mapper';
import type { ExceptionReportGateEventPayload, ReportGateEventPayload } from './types/reports.types';

function makeEvent(overrides: Partial<ReportGateEventPayload> = {}): ReportGateEventPayload {
  return {
    occurredAt: new Date(2026, 6, 14, 8, 0, 0),
    result: GateEventResult.VERIFIED,
    timeline: [],
    ...overrides,
  };
}

describe('reports mapper', () => {
  it('keeps manual overrides separate from exceptions and ignores open events in pass-time samples', () => {
    const summary = buildReportSummary([
      makeEvent({
        timeline: [
          { type: TimelineEventType.RFID_SCANNED, occurredAt: new Date(2026, 6, 14, 8, 0, 0) },
          { type: TimelineEventType.BARRIER_OPENED, occurredAt: new Date(2026, 6, 14, 8, 0, 2) },
        ],
      }),
      makeEvent({
        result: GateEventResult.MANUAL_OVERRIDE,
        timeline: [{ type: TimelineEventType.BARRIER_OPENED, occurredAt: new Date(2026, 6, 14, 9, 0, 0) }],
      }),
      makeEvent({ result: GateEventResult.PLATE_MISMATCH }),
    ]);

    expect(summary).toMatchObject({
      totalGateEvents: 3,
      verified: 1,
      exceptions: 1,
      manualOverrides: 1,
      openEvents: 1,
      verificationRate: 33.3,
      avgPassTime: { milliseconds: 2000, sampleSize: 1 },
    });
    expect(summary.resultCounts).toEqual({
      VERIFIED: 1,
      UNKNOWN_TAG: 0,
      FACE_MISMATCH: 0,
      PLATE_MISMATCH: 1,
      MANUAL_OVERRIDE: 1,
      DENIED: 0,
      BANNED: 0,
      ERROR: 0,
    });
  });

  it('creates a zero-filled daily month breakdown', () => {
    const days = buildMonthlyBreakdownDays(
      [makeEvent({ occurredAt: new Date(2026, 6, 2, 9, 0, 0), result: GateEventResult.DENIED })],
      [new Date(2026, 6, 1), new Date(2026, 6, 2), new Date(2026, 6, 3)],
    );

    expect(days.map((day) => ({ date: day.date, total: day.totalGateEvents, exceptions: day.exceptions }))).toEqual([
      { date: '2026-07-01', total: 0, exceptions: 0 },
      { date: '2026-07-02', total: 1, exceptions: 1 },
      { date: '2026-07-03', total: 0, exceptions: 0 },
    ]);
  });

  it('returns every tied peak hour and keeps overrides out of exception buckets', () => {
    const hours = buildPeakHourBuckets([
      makeEvent({ occurredAt: new Date(2026, 6, 14, 8, 10, 0) }),
      makeEvent({ occurredAt: new Date(2026, 6, 14, 8, 20, 0), result: GateEventResult.FACE_MISMATCH }),
      makeEvent({ occurredAt: new Date(2026, 6, 14, 17, 10, 0), result: GateEventResult.MANUAL_OVERRIDE }),
      makeEvent({ occurredAt: new Date(2026, 6, 14, 17, 20, 0) }),
    ]);

    expect(hours[8]).toMatchObject({ totalGateEvents: 2, verified: 1, exceptions: 1, manualOverrides: 0 });
    expect(hours[17]).toMatchObject({ totalGateEvents: 2, verified: 1, exceptions: 0, manualOverrides: 1 });
    expect(findPeakHourBuckets(hours).map((hour) => hour.hour)).toEqual([8, 17]);
  });

  it('maps exception list context and excludes overrides from exception counts', () => {
    const event: ExceptionReportGateEventPayload = {
      id: 'event-1',
      eventCode: 'GATE-001',
      occurredAt: new Date(2026, 6, 14, 8, 0, 0),
      result: GateEventResult.UNKNOWN_TAG,
      plateNumberRead: 'ABC-123',
      rfidTag: null,
      truck: null,
      driver: null,
      verification: null,
      timeline: [],
    };

    expect(toExceptionReportItem(event)).toMatchObject({
      id: 'event-1',
      result: GateEventResult.UNKNOWN_TAG,
      reason: 'The RFID tag is not registered.',
      isOpen: true,
    });
    expect(buildExceptionResultCounts([
      { result: GateEventResult.UNKNOWN_TAG, _count: { _all: 2 } },
      { result: GateEventResult.MANUAL_OVERRIDE, _count: { _all: 4 } },
    ])).toEqual({
      UNKNOWN_TAG: 2,
      FACE_MISMATCH: 0,
      PLATE_MISMATCH: 0,
      DENIED: 0,
      BANNED: 0,
      ERROR: 0,
    });
  });
});
