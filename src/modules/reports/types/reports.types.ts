import type { GateEventResult, Prisma, RFIDTagStatus } from '@prisma/client';

import type { ExceptionGateEventResult } from 'src/common/gate-events/gate-event.constants';
import type { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import type {
  EXCEPTIONS_REPORT_GATE_EVENT_SELECT,
  REPORT_GATE_EVENT_SELECT,
  REPORT_PREVIOUS_SUMMARY_EVENT_SELECT,
} from '../constants/reports.constants';

export type GateEventResultCounts = Record<GateEventResult, number>;
export type ExceptionGateEventResultCounts = Record<ExceptionGateEventResult, number>;

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface AveragePassTime {
  milliseconds: number | null;
  sampleSize: number;
}

export interface PreviousReportSummary {
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
  verificationRate: number;
}

export interface ReportMetrics {
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
  openEvents: number;
  verificationRate: number;
  avgPassTime: AveragePassTime;
  resultCounts: GateEventResultCounts;
}

export interface ReportSummary extends ReportMetrics {
  previous: PreviousReportSummary | null;
}

export interface DailyHourlyThroughputBucket {
  hour: number;
  verified: number;
  exception: number;
  total: number;
}

export interface DailySummaryReport {
  date: string;
  title: string;
  generatedAt: Date;
  summary: ReportSummary;
  hourlyThroughput: DailyHourlyThroughputBucket[];
}

export interface MonthlyBreakdownDay extends ReportMetrics {
  date: string;
}

export interface MonthlyBreakdownReport {
  month: string;
  generatedAt: Date;
  summary: ReportSummary;
  days: MonthlyBreakdownDay[];
}

export interface PeakHourBucket {
  hour: number;
  label: string;
  totalGateEvents: number;
  verified: number;
  exceptions: number;
  manualOverrides: number;
}

export interface PeakHoursReport {
  period: ReportPeriod;
  generatedAt: Date;
  summary: ReportSummary;
  hours: PeakHourBucket[];
  peakHours: PeakHourBucket[];
}

export interface ExceptionReportItem {
  id: string;
  eventCode: string;
  occurredAt: Date;
  result: ExceptionGateEventResult;
  reason: string;
  plateRead: string | null;
  rfidTag: { epcId: string; status: RFIDTagStatus } | null;
  truck: { id: string; plateNumber: string; model: string | null } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
  verification: {
    rfidMatched: boolean;
    plateMatched: boolean | null;
    faceMatched: boolean | null;
    plateConfidence: number | null;
    faceConfidence: number | null;
    verifiedAt: Date;
  } | null;
  barrierOpenedAt: Date | null;
  isOpen: boolean;
}

export interface ExceptionsReport extends PaginatedResponse<ExceptionReportItem> {
  meta: PaginatedResponse<ExceptionReportItem>['meta'] & {
    period: ReportPeriod;
    resultCounts: ExceptionGateEventResultCounts;
    openCount: number;
  };
}

export type ReportGateEventPayload = Prisma.GateEventGetPayload<{ select: typeof REPORT_GATE_EVENT_SELECT }>;
export type PreviousReportSummaryEventPayload = Prisma.GateEventGetPayload<{ select: typeof REPORT_PREVIOUS_SUMMARY_EVENT_SELECT }>;
export type ExceptionReportGateEventPayload = Prisma.GateEventGetPayload<{ select: typeof EXCEPTIONS_REPORT_GATE_EVENT_SELECT }>;
