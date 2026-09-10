import type { AssignmentRole, GateEventResult, Prisma, RFIDTagStatus } from '@prisma/client';

import type { RecentGateEvent } from 'src/common/gate-events/gate-event-analytics.service';
import type { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import type { TRUCK_DETAIL_INCLUDE, TRUCK_LIST_INCLUDE, TRUCK_WITH_DRIVERS_INCLUDE, UNTAGGED_TRUCK_SELECT } from '../constants/trucks.constants';

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
  model: string | null;
  photoUrl: string | null;
  isArchived: boolean;
  isPermanentlyBanned: boolean;
  bannedUntil: Date | null;
  isBanned: boolean;
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
  model: string | null;
  photoUrl: string | null;
  isArchived: boolean;
  isPermanentlyBanned: boolean;
  bannedUntil: Date | null;
  isBanned: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  drivers: TruckDetailDriver[];
  boundTag: TruckBoundTagSummary | null;
  events30d: number;
  lastEventAt: Date | null;
  lastResult: GateEventResult | null;
  recentGateEvents: RecentGateEvent[];
  createdAt: Date;
}

export type TruckUntaggedItem = Prisma.TruckGetPayload<{ select: typeof UNTAGGED_TRUCK_SELECT }>;

export interface TruckListResponse extends PaginatedResponse<TruckListItem> {
  meta: PaginatedResponse<TruckListItem>['meta'] & {
    counts: {
      withNoDriver: number;
    };
  };
}

export type TruckListPayload = Prisma.TruckGetPayload<{ include: typeof TRUCK_LIST_INCLUDE }>;
export type TruckDetailPayload = Prisma.TruckGetPayload<{ include: typeof TRUCK_DETAIL_INCLUDE }>;
export type TruckWithDrivers = Prisma.TruckGetPayload<{ include: typeof TRUCK_WITH_DRIVERS_INCLUDE }>;
