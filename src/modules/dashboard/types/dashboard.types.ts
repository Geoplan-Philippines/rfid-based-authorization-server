import { GateEventResult, Prisma, TimelineEventType } from '@prisma/client';

// Minimal day-window payload the service fetches once and reuses for every section of the overview
// (cards, hourly buckets, needs-review preview). Timeline is filtered to the two markers needed to
// measure RFID→barrier pass time, keeping the row small.
export const dashboardEventSelect = {
  id: true,
  eventCode: true,
  occurredAt: true,
  result: true,
  timeline: {
    where: { type: { in: [TimelineEventType.RFID_SCANNED, TimelineEventType.BARRIER_OPENED] } },
    select: { type: true, occurredAt: true },
  },
} satisfies Prisma.GateEventSelect;

export type DashboardEventPayload = Prisma.GateEventGetPayload<{ select: typeof dashboardEventSelect }>;

// Frontend-facing shapes. One overview object backs the whole dashboard screen.

export interface DashboardCards {
  // Total passes in the window, with the change against the previous day.
  trucksToday: { value: number; deltaVsYesterday: number };
  // Clean passes, plus their share of total (0–100, one decimal).
  verified: { value: number; rate: number };
  // Passes needing operator review (see EXCEPTION_GATE_RESULTS).
  exceptions: { value: number };
  // Mean RFID→barrier duration. `milliseconds` is null when no pass completed (no sample).
  avgPassTime: { milliseconds: number | null; sampleSize: number };
}

export interface HourlyThroughputBucket {
  hour: number; // 0–23, gate-local
  verified: number;
  exception: number;
  total: number;
}

export interface NeedsReviewItem {
  id: string;
  eventCode: string;
  occurredAt: Date;
  result: GateEventResult;
}

export interface DashboardOverview {
  date: string; // YYYY-MM-DD window the data covers (gate-local)
  generatedAt: Date;
  cards: DashboardCards;
  hourlyThroughput: HourlyThroughputBucket[];
  needsReview: {
    open: number; // total exceptions in the window
    items: NeedsReviewItem[];
  };
}
