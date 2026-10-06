import { Prisma, ExpresswayTagStatus } from '@prisma/client';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

export interface ExpresswayAssignedTruckSummary {
  id: string;
  plateNumber: string;
  model: string | null;
}

export interface ExpresswayTagListItem {
  id: string;
  epcId: string;
  label: string | null;
  status: ExpresswayTagStatus;
  truck: ExpresswayAssignedTruckSummary | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpresswayTagStatusCounts = Record<ExpresswayTagStatus, number> & {
  total: number;
};

export interface ExpresswayTagStatusHistoryItem {
  fromStatus: ExpresswayTagStatus | null;
  toStatus: ExpresswayTagStatus;
  reason: string | null;
  createdAt: Date;
}

export interface ExpresswayTagDetail extends ExpresswayTagListItem {
  statusHistory: ExpresswayTagStatusHistoryItem[];
}

export interface ExpresswayTagListResponse extends PaginatedResponse<ExpresswayTagListItem> {
  meta: PaginatedResponse<ExpresswayTagListItem>['meta'] & {
    counts: ExpresswayTagStatusCounts;
  };
}

export const expresswayTagWithTruckInclude = {
  truck: true,
} satisfies Prisma.ExpresswayTagInclude;

export type ExpresswayTagWithTruck = Prisma.ExpresswayTagGetPayload<{ include: typeof expresswayTagWithTruckInclude }>;
