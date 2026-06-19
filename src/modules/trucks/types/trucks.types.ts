import { AssignmentRole, GateEventResult, Prisma, RFIDTagStatus } from '@prisma/client';

import { RecentGateEvent } from 'src/common/gate-events/gate-event-analytics.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

export interface TruckDriverListSummary {
  id: string;
  name: string;
  role: AssignmentRole;
}

export interface TruckBoundTagSummary {
  epcId: string;
  status: RFIDTagStatus;
}

export interface TruckListItem {
  id: string;
  plateNumber: string;
  model: string;
  photoUrl: string | null;
  isArchived: boolean;
  drivers: TruckDriverListSummary[];
  driversCount: number;
  boundTag: TruckBoundTagSummary | null;
  events30d: number;
  lastEventAt: Date | null;
}

export interface TruckDetailDriver {
  id: string;
  name: string;
  licenseNumber: string;
  role: AssignmentRole;
  since: Date;
  photoUrl: string | null;
}

export interface TruckDetail {
  id: string;
  plateNumber: string;
  model: string;
  photoUrl: string | null;
  isArchived: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  drivers: TruckDetailDriver[];
  boundTag: TruckBoundTagSummary | null;
  events30d: number;
  lastEventAt: Date | null;
  lastResult: GateEventResult | null;
  recentGateEvents: RecentGateEvent[];
  createdAt: Date;
}

export interface TruckListResponse extends PaginatedResponse<TruckListItem> {
  meta: PaginatedResponse<TruckListItem>['meta'] & {
    counts: {
      withNoDriver: number;
    };
  };
}

export const truckWithDriversInclude = {
  driverAssignments: {
    include: { driver: true },
  },
} satisfies Prisma.TruckInclude;

export type TruckWithDrivers = Prisma.TruckGetPayload<{ include: typeof truckWithDriversInclude }>;
