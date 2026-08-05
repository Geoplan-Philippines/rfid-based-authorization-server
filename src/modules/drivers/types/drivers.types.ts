import { AssignmentRole, GateEventResult, Prisma, RFIDTagStatus } from '@prisma/client';

import { RecentGateEvent } from 'src/common/gate-events/gate-event-analytics.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

export interface DriverTruckListSummary {
  id: string;
  plateNumber: string;
}

export interface DriverListItem {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  photoUrl: string | null;
  isArchived: boolean;
  trucksCount: number;
  trucks: DriverTruckListSummary[];
  events30d: number;
  lastEventAt: Date | null;
  createdAt: Date;
}

export interface DriverDetailTruck {
  id: string;
  plateNumber: string;
  model: string | null;
  role: AssignmentRole;
  since: Date;
  tagEpc: string | null;
  tagStatus: RFIDTagStatus | null;
}

export interface DriverDetail {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  photoUrl: string | null;
  isArchived: boolean;
  trucks: DriverDetailTruck[];
  events30d: number;
  denials30d: number;
  lastEventAt: Date | null;
  lastResult: GateEventResult | null;
  createdAt: Date;
  recentGateEvents: RecentGateEvent[];
}

export type DriverListResponse = PaginatedResponse<DriverListItem>;

export const driverWithTrucksInclude = {
  truckAssignments: {
    include: { truck: true },
  },
} satisfies Prisma.DriverInclude;

export type DriverWithTrucks = Prisma.DriverGetPayload<{ include: typeof driverWithTrucksInclude }>;
