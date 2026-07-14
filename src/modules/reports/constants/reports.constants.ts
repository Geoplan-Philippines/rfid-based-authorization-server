import { Prisma, TimelineEventType } from '@prisma/client';

export const REPORT_HOURS_PER_DAY = 24;

// This compact payload is enough to calculate every aggregate used by daily, monthly, and peak-hour
// reports. The two timeline markers distinguish open events and completed RFID-to-barrier samples.
export const REPORT_GATE_EVENT_SELECT = {
  occurredAt: true,
  result: true,
  timeline: {
    where: { type: { in: [TimelineEventType.RFID_SCANNED, TimelineEventType.BARRIER_OPENED] } },
    select: { type: true, occurredAt: true },
  },
} satisfies Prisma.GateEventSelect;

// Previous-period comparison only needs a result to build its compact KPI baseline.
export const REPORT_PREVIOUS_SUMMARY_EVENT_SELECT = {
  result: true,
} satisfies Prisma.GateEventSelect;

// The exception list needs enough registry and verification context for a frontend table without
// requiring an N+1 detail lookup for every row.
export const EXCEPTIONS_REPORT_GATE_EVENT_SELECT = {
  id: true,
  eventCode: true,
  occurredAt: true,
  result: true,
  plateNumberRead: true,
  rfidTag: {
    select: { epcId: true, status: true },
  },
  truck: {
    select: { id: true, plateNumber: true, model: true },
  },
  driver: {
    select: { id: true, firstName: true, lastName: true },
  },
  verification: {
    select: {
      rfidMatched: true,
      plateMatched: true,
      faceMatched: true,
      plateConfidence: true,
      faceConfidence: true,
      verifiedAt: true,
    },
  },
  timeline: {
    where: { type: TimelineEventType.BARRIER_OPENED },
    orderBy: { occurredAt: 'desc' },
    take: 1,
    select: { occurredAt: true },
  },
} satisfies Prisma.GateEventSelect;
