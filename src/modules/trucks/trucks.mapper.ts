import type { GateEventSummary, RecentGateEvent } from 'src/common/gate-events/gate-event-analytics.service';
import type { TruckBoundTagSummary, TruckDetail, TruckDetailPayload, TruckListItem, TruckListPayload } from './types/trucks.types';

export function mapTruckToListItem(truck: TruckListPayload, summary: GateEventSummary): TruckListItem {
  return {
    id: truck.id,
    plateNumber: truck.plateNumber,
    model: truck.model,
    photoUrl: truck.photoUrl,
    isArchived: truck.isArchived,
    drivers: truck.driverAssignments.map((assignment) => ({
      id: assignment.driver.id,
      name: formatDriverName(assignment.driver.firstName, assignment.driver.lastName),
      role: assignment.role,
    })),
    driversCount: truck.driverAssignments.length,
    boundTag: mapBoundTag(truck.rfidTag),
    events30d: summary.events30d,
    lastEventAt: summary.lastEventAt,
  };
}

export function mapTruckToDetail(
  truck: TruckDetailPayload,
  summary: GateEventSummary,
  recentGateEvents: RecentGateEvent[],
): TruckDetail {
  return {
    id: truck.id,
    plateNumber: truck.plateNumber,
    model: truck.model,
    photoUrl: truck.photoUrl,
    isArchived: truck.isArchived,
    status: truck.isArchived ? 'ARCHIVED' : 'ACTIVE',
    drivers: truck.driverAssignments.map((assignment) => ({
      id: assignment.driver.id,
      name: formatDriverName(assignment.driver.firstName, assignment.driver.lastName),
      licenseNumber: assignment.driver.licenseNumber,
      role: assignment.role,
      since: assignment.createdAt,
      photoUrl: assignment.driver.photoUrl,
    })),
    boundTag: mapBoundTag(truck.rfidTag),
    events30d: summary.events30d,
    lastEventAt: summary.lastEventAt,
    lastResult: summary.lastResult,
    recentGateEvents,
    createdAt: truck.createdAt,
  };
}

function mapBoundTag(rfidTag: TruckListPayload['rfidTag']): TruckBoundTagSummary | null {
  if (!rfidTag) return null;

  return {
    epcId: rfidTag.epcId,
    status: rfidTag.status,
  };
}

function formatDriverName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}
