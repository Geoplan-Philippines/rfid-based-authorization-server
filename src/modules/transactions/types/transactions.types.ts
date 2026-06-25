import { GateEventResult, Prisma, RFIDTagStatus, SnapshotType, TimelineEventType, TruckDriverAssignmentStatus } from '@prisma/client';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

// Prisma payload shapes (single source of truth for what the service queries).

export const transactionListInclude = {
  rfidTag: true,
  truck: true,
  driver: true,
  // Only the barrier-opened marker is needed to derive open/closed for the list (cheap: at most 1 row).
  timeline: { where: { type: TimelineEventType.BARRIER_OPENED }, select: { id: true }, take: 1 },
} satisfies Prisma.GateEventInclude;

export const transactionDetailInclude = {
  rfidTag: true,
  truck: {
    include: {
      // Active assignment only; used to flag captured-driver vs assigned-driver mismatches.
      driverAssignments: {
        where: { status: TruckDriverAssignmentStatus.ACTIVE },
        include: { driver: true },
        take: 1,
      },
    },
  },
  driver: true,
  verification: true,
  snapshots: true,
  timeline: { orderBy: { occurredAt: 'asc' } },
} satisfies Prisma.GateEventInclude;

// Open transaction = not yet closed by the barrier step. Minimal include the pipeline stages
// (plate/face/barrier) need to patch the current event. `rfidTag` is included so plate/face reads
// can recompute the result from the real tag state (matched? active?) rather than assuming the tag
// was valid — an unknown or deactivated tag's result must stay UNKNOWN_TAG/DENIED through the
// pipeline. `truck` is nullable (absent for an unknown tag).
export const openTransactionInclude = {
  rfidTag: true,
  truck: { include: { driverAssignments: { where: { status: TruckDriverAssignmentStatus.ACTIVE }, take: 1 } } },
  verification: true,
} satisfies Prisma.GateEventInclude;

export type GateEventListPayload = Prisma.GateEventGetPayload<{ include: typeof transactionListInclude }>;
export type GateEventDetailPayload = Prisma.GateEventGetPayload<{ include: typeof transactionDetailInclude }>;
export type OpenTransaction = Prisma.GateEventGetPayload<{ include: typeof openTransactionInclude }>;

// Frontend-facing shapes. Display helpers (plateMismatch, truckInRegistry, faceMatchesAssigned)
// are computed by the backend so the UI can render directly.

export interface DriverSummary {
  firstName: string;
  lastName: string;
}

export interface TransactionListItem {
  id: string;
  eventCode: string;
  occurredAt: Date;
  result: GateEventResult;
  rfidTag: { epcId: string; status: RFIDTagStatus } | null;
  plateRead: string | null;
  plateMismatch: boolean;
  truck: { plateNumber: string; model: string } | null;
  truckInRegistry: boolean;
  driver: DriverSummary | null;
  // True while the transaction is still mid-pipeline (not terminal, barrier not yet opened).
  isOpen: boolean;
}

export type TransactionResultCounts = Record<GateEventResult, number>;

export interface TransactionListResponse extends PaginatedResponse<TransactionListItem> {
  meta: PaginatedResponse<TransactionListItem>['meta'] & {
    counts: TransactionResultCounts;
  };
}

export interface TransactionTimelineEvent {
  type: TimelineEventType;
  message: string | null;
  metadata: Prisma.JsonValue;
  occurredAt: Date;
}

export interface TransactionVerification {
  rfidMatched: boolean;
  plateMatched: boolean | null;
  faceMatched: boolean | null;
  plateConfidence: number | null;
  faceConfidence: number | null;
  verifiedAt: Date;
}

export interface TransactionDetail {
  id: string;
  eventCode: string;
  occurredAt: Date;
  result: GateEventResult;
  plateRead: string | null;
  plateMismatch: boolean;
  verification: TransactionVerification | null;
  timeline: TransactionTimelineEvent[];
  rfidTag: { epcId: string; status: RFIDTagStatus; assignedTruckPlate: string | null } | null;
  truck: { plateNumber: string; model: string; assignedDriver: DriverSummary | null } | null;
  truckInRegistry: boolean;
  driver: (DriverSummary & { id: string }) | null;
  // True when the event's recorded driver matches the truck's active assignment.
  // Depends on face recognition populating the event driver; false until that service lands.
  faceMatchesAssigned: boolean;
  snapshots: { id: string; type: SnapshotType; imageUrl: string }[];
  // True while the transaction is still mid-pipeline (not terminal, barrier not yet opened).
  isOpen: boolean;
}
