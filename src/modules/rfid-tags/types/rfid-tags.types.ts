import { GateEventResult, Prisma, RFIDTagStatus } from '@prisma/client';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

export interface RfidAssignedTruckSummary {
  id: string;
  plateNumber: string;
  model: string;
}

export interface RfidTagListItem {
  id: string;
  epcId: string;
  status: RFIDTagStatus;
  assignedTruck: RfidAssignedTruckSummary | null;
  lastSeenAt: Date | null;
  lastResult: GateEventResult | null;
  events30d: number;
}

export type RfidTagStatusCounts = Record<RFIDTagStatus, number> & {
  total: number;
};

export interface RfidTagStatusHistoryItem {
  fromStatus: RFIDTagStatus | null;
  toStatus: RFIDTagStatus;
  reason: string | null;
  createdAt: Date;
}

export interface RfidTagDetail extends RfidTagListItem {
  boundSince: Date;
  lastVerifiedAt: Date | null;
  denials7d: number;
  statusHistory: RfidTagStatusHistoryItem[];
}

export interface RfidTagListResponse extends PaginatedResponse<RfidTagListItem> {
  meta: PaginatedResponse<RfidTagListItem>['meta'] & {
    counts: RfidTagStatusCounts;
  };
}

export const rfidTagWithTruckInclude = {
  assignedTruck: true,
} satisfies Prisma.RFIDTagInclude;

export type RfidTagWithTruck = Prisma.RFIDTagGetPayload<{ include: typeof rfidTagWithTruckInclude }>;
