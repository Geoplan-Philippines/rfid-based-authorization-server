import { TimelineEventType } from '@prisma/client';

import { GateEventDetailPayload, GateEventListPayload, TransactionDetail, TransactionListItem } from './types/transactions.types';
import { isTransactionOpen } from './transactions.policy';

// Pure response shapers: turn a Prisma payload into the display-ready shape the frontend consumes.
// Kept out of the service so they stay free of DB/DI concerns and are trivially unit-testable.

export function toTransactionListItem(event: GateEventListPayload): TransactionListItem {
  return {
    id: event.id,
    eventCode: event.eventCode,
    occurredAt: event.occurredAt,
    result: event.result,
    rfidTag: event.rfidTag ? { epcId: event.rfidTag.epcId, status: event.rfidTag.status } : null,
    plateRead: event.plateNumberRead,
    plateMismatch: isPlateMismatch(event.plateNumberRead, event.truck?.plateNumber),
    truck: event.truck ? { plateNumber: event.truck.plateNumber, model: event.truck.model } : null,
    truckInRegistry: event.truck !== null,
    driver: event.driver ? { firstName: event.driver.firstName, lastName: event.driver.lastName } : null,
    // List include filters timeline to BARRIER_OPENED only, so any row means the barrier opened.
    isOpen: isTransactionOpen(event.result, event.timeline.length > 0),
  };
}

export function toTransactionDetail(event: GateEventDetailPayload): TransactionDetail {
  const assignedDriver = event.truck?.driverAssignments[0]?.driver ?? null;

  return {
    id: event.id,
    eventCode: event.eventCode,
    occurredAt: event.occurredAt,
    result: event.result,
    plateRead: event.plateNumberRead,
    plateMismatch: isPlateMismatch(event.plateNumberRead, event.truck?.plateNumber),
    verification: event.verification
      ? {
          rfidMatched: event.verification.rfidMatched,
          plateMatched: event.verification.plateMatched,
          faceMatched: event.verification.faceMatched,
          plateConfidence: event.verification.plateConfidence,
          faceConfidence: event.verification.faceConfidence,
          verifiedAt: event.verification.verifiedAt,
        }
      : null,
    timeline: event.timeline.map((entry) => ({
      type: entry.type,
      message: entry.message,
      metadata: entry.metadata,
      occurredAt: entry.occurredAt,
    })),
    rfidTag: event.rfidTag
      ? { epcId: event.rfidTag.epcId, status: event.rfidTag.status, assignedTruckPlate: event.truck?.plateNumber ?? null }
      : null,
    truck: event.truck
      ? {
          plateNumber: event.truck.plateNumber,
          model: event.truck.model,
          assignedDriver: assignedDriver ? { firstName: assignedDriver.firstName, lastName: assignedDriver.lastName } : null,
        }
      : null,
    truckInRegistry: event.truck !== null,
    driver: event.driver ? { id: event.driver.id, firstName: event.driver.firstName, lastName: event.driver.lastName } : null,
    // Meaningful only after the face stage has run; before that the event has no recognised driver.
    faceMatchesAssigned: assignedDriver !== null && event.driverId === assignedDriver.id,
    snapshots: event.snapshots.map((snapshot) => ({ id: snapshot.id, type: snapshot.type, imageUrl: snapshot.imageUrl })),
    isOpen: isTransactionOpen(event.result, event.timeline.some((entry) => entry.type === TimelineEventType.BARRIER_OPENED)),
  };
}

function isPlateMismatch(plateRead: string | null, truckPlate: string | undefined): boolean {
  return plateRead !== null && truckPlate !== undefined && plateRead !== truckPlate;
}
