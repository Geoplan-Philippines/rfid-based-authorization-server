import { TimelineEventType } from '@prisma/client';

import { GateEventDetailPayload, GateEventListPayload, TransactionDetail, TransactionListItem } from './types/transactions.types';
import { isTransactionOpen } from './transactions.policy';

// Pure response shapers: turn a Prisma payload into the display-ready shape the frontend consumes.
// Kept out of the service so they stay free of DB/DI concerns and are trivially unit-testable.

function extractScannedEpc(timeline?: Array<{ type: TimelineEventType; message: string | null }>): string | null {
  if (!timeline) return null;
  const scanEvent = timeline.find((e) => e.type === TimelineEventType.RFID_SCANNED);
  if (!scanEvent || !scanEvent.message) return null;
  const match = scanEvent.message.match(/^EPC\s+(.+)$/);
  return match ? match[1].trim() : scanEvent.message.trim();
}

export function toTransactionListItem(event: GateEventListPayload): TransactionListItem {
  const scannedEpc = extractScannedEpc(event.timeline);
  const rfidTag = event.rfidTag
    ? { epcId: event.rfidTag.epcId, status: event.rfidTag.status }
    : scannedEpc
      ? { epcId: scannedEpc, status: null }
      : null;

  return {
    id: event.id,
    eventCode: event.eventCode,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
    result: event.result,
    rfidTag,
    plateRead: event.plateNumberRead,
    plateMismatch: isPlateMismatch(event.plateNumberRead, event.truck?.plateNumber),
    truck: event.truck ? { plateNumber: event.truck.plateNumber, model: event.truck.model } : null,
    truckInRegistry: event.truck !== null,
    driver: event.driver ? { firstName: event.driver.firstName, lastName: event.driver.lastName } : null,
    isOpen: isTransactionOpen(event.timeline.some((entry) => entry.type === TimelineEventType.BARRIER_OPENED)),
  };
}

export function toTransactionListItemFromDetail(detail: TransactionDetail, createdAt?: Date): TransactionListItem {
  return {
    id: detail.id,
    eventCode: detail.eventCode,
    occurredAt: detail.occurredAt,
    createdAt: createdAt ?? detail.occurredAt,
    result: detail.result,
    rfidTag: detail.rfidTag ? { epcId: detail.rfidTag.epcId, status: detail.rfidTag.status } : null,
    plateRead: detail.plateRead,
    plateMismatch: detail.plateMismatch,
    truck: detail.truck ? { plateNumber: detail.truck.plateNumber, model: detail.truck.model } : null,
    truckInRegistry: detail.truckInRegistry,
    driver: detail.driver ? { firstName: detail.driver.firstName, lastName: detail.driver.lastName } : null,
    isOpen: detail.isOpen,
  };
}

export function toTransactionDetail(event: GateEventDetailPayload): TransactionDetail {
  const assignedDriver = event.truck?.driverAssignments[0]?.driver ?? null;
  const scannedEpc = extractScannedEpc(event.timeline);
  const rfidTag = event.rfidTag
    ? { epcId: event.rfidTag.epcId, status: event.rfidTag.status, assignedTruckPlate: event.truck?.plateNumber ?? null }
    : scannedEpc
      ? { epcId: scannedEpc, status: null, assignedTruckPlate: null }
      : null;

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
    rfidTag,
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
    isOpen: isTransactionOpen(event.timeline.some((entry) => entry.type === TimelineEventType.BARRIER_OPENED)),
  };
}

function isPlateMismatch(plateRead: string | null, truckPlate: string | undefined): boolean {
  return plateRead !== null && truckPlate !== undefined && plateRead !== truckPlate;
}
