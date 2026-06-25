import { Injectable } from '@nestjs/common';
import { GateEventResult, Prisma } from '@prisma/client';
import { subDays } from 'date-fns';

import { PrismaService } from '../../core/database/prisma.service';

const DENIED_GATE_RESULTS: GateEventResult[] = [
  GateEventResult.UNKNOWN_TAG,
  GateEventResult.FACE_MISMATCH,
  GateEventResult.PLATE_MISMATCH,
  GateEventResult.DENIED,
  GateEventResult.ERROR,
];

type GateEventEntityField = 'driverId' | 'truckId' | 'rfidTagId';

type GateEventGroupRow = {
  driverId?: string | null;
  truckId?: string | null;
  rfidTagId?: string | null;
  _count?: { _all: number };
  _max?: { occurredAt: Date | null };
};

export interface GateEventSummary {
  events30d: number;
  denials7d: number;
  denials30d: number;
  lastEventAt: Date | null;
  lastResult: GateEventResult | null;
}

export interface RecentGateEvent {
  id: string;
  eventCode: string;
  occurredAt: Date;
  result: GateEventResult;
  truck: { id: string; plateNumber: string; model: string } | null;
  driver: { id: string; firstName: string; lastName: string } | null;
}

@Injectable()
export class GateEventAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDriverGateEventSummaries(driverIds: string[]): Promise<Record<string, GateEventSummary>> {
    return this.getGateEventSummaries(driverIds, 'driverId');
  }

  async getTruckGateEventSummaries(truckIds: string[]): Promise<Record<string, GateEventSummary>> {
    return this.getGateEventSummaries(truckIds, 'truckId');
  }

  async getRfidTagGateEventSummaries(rfidTagIds: string[]): Promise<Record<string, GateEventSummary>> {
    return this.getGateEventSummaries(rfidTagIds, 'rfidTagId');
  }

  async getRecentDriverGateEvents(driverId: string, take = 5): Promise<RecentGateEvent[]> {
    return this.getRecentGateEvents({ driverId }, take);
  }

  async getRecentTruckGateEvents(truckId: string, take = 5): Promise<RecentGateEvent[]> {
    return this.getRecentGateEvents({ truckId }, take);
  }

  async getRecentRfidTagGateEvents(rfidTagId: string, take = 5): Promise<RecentGateEvent[]> {
    return this.getRecentGateEvents({ rfidTagId }, take);
  }

  private async getGateEventSummaries(
    entityIds: string[],
    field: GateEventEntityField,
  ): Promise<Record<string, GateEventSummary>> {
    const summaries = this.createEmptySummaries(entityIds);
    if (entityIds.length === 0) return summaries;

    const now = new Date();
    const since7d = subDays(now, 7);
    const since30d = subDays(now, 30);

    const [eventRows30d, denialRows7d, denialRows30d, latestRows] = await Promise.all([
      this.groupGateEventCounts(
        field,
        this.buildEntityWhere(field, entityIds, { occurredAt: { gte: since30d } }),
      ),
      this.groupGateEventCounts(
        field,
        this.buildEntityWhere(field, entityIds, {
          occurredAt: { gte: since7d },
          result: { in: DENIED_GATE_RESULTS },
        }),
      ),
      this.groupGateEventCounts(
        field,
        this.buildEntityWhere(field, entityIds, {
          occurredAt: { gte: since30d },
          result: { in: DENIED_GATE_RESULTS },
        }),
      ),
      this.groupLatestGateEvents(field, this.buildEntityWhere(field, entityIds)),
    ]);

    this.assignCountToSummaries(summaries, eventRows30d, field, 'events30d');
    this.assignCountToSummaries(summaries, denialRows7d, field, 'denials7d');
    this.assignCountToSummaries(summaries, denialRows30d, field, 'denials30d');
    await this.assignLatestEventsToSummaries(summaries, latestRows, field);

    return summaries;
  }

  private async getRecentGateEvents(where: Prisma.GateEventWhereInput, take: number): Promise<RecentGateEvent[]> {
    return this.prisma.gateEvent.findMany({
      where,
      take,
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        eventCode: true,
        occurredAt: true,
        result: true,
        truck: { select: { id: true, plateNumber: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  private buildEntityWhere(
    field: GateEventEntityField,
    entityIds: string[],
    extra: Prisma.GateEventWhereInput = {},
  ): Prisma.GateEventWhereInput {
    return {
      [field]: { in: entityIds },
      ...extra,
    };
  }

  private async groupGateEventCounts(
    field: GateEventEntityField,
    where: Prisma.GateEventWhereInput,
  ): Promise<GateEventGroupRow[]> {
    if (field === 'driverId') {
      const rows = await this.prisma.gateEvent.groupBy({ by: ['driverId'] as const, where, _count: { _all: true } });
      return rows;
    }

    if (field === 'truckId') {
      const rows = await this.prisma.gateEvent.groupBy({ by: ['truckId'] as const, where, _count: { _all: true } });
      return rows;
    }

    const rows = await this.prisma.gateEvent.groupBy({ by: ['rfidTagId'] as const, where, _count: { _all: true } });
    return rows;
  }

  private async groupLatestGateEvents(
    field: GateEventEntityField,
    where: Prisma.GateEventWhereInput,
  ): Promise<GateEventGroupRow[]> {
    if (field === 'driverId') {
      const rows = await this.prisma.gateEvent.groupBy({ by: ['driverId'] as const, where, _max: { occurredAt: true } });
      return rows;
    }

    if (field === 'truckId') {
      const rows = await this.prisma.gateEvent.groupBy({ by: ['truckId'] as const, where, _max: { occurredAt: true } });
      return rows;
    }

    const rows = await this.prisma.gateEvent.groupBy({ by: ['rfidTagId'] as const, where, _max: { occurredAt: true } });
    return rows;
  }

  private createEmptySummaries(entityIds: string[]): Record<string, GateEventSummary> {
    return entityIds.reduce<Record<string, GateEventSummary>>((summaries, entityId) => {
      summaries[entityId] = {
        events30d: 0,
        denials7d: 0,
        denials30d: 0,
        lastEventAt: null,
        lastResult: null,
      };
      return summaries;
    }, {});
  }

  private assignCountToSummaries(
    summaries: Record<string, GateEventSummary>,
    rows: GateEventGroupRow[],
    field: GateEventEntityField,
    key: 'events30d' | 'denials7d' | 'denials30d',
  ): void {
    for (const row of rows) {
      const entityId = row[field];
      if (!entityId || !summaries[entityId]) continue;
      summaries[entityId][key] = row._count?._all ?? 0;
    }
  }

  private async assignLatestEventsToSummaries(
    summaries: Record<string, GateEventSummary>,
    rows: GateEventGroupRow[],
    field: GateEventEntityField,
  ): Promise<void> {
    const filters: Prisma.GateEventWhereInput[] = [];

    for (const row of rows) {
      const entityId = row[field];
      const occurredAt = row._max?.occurredAt;
      if (!entityId || !occurredAt) continue;
      filters.push({ [field]: entityId, occurredAt });
    }

    if (filters.length === 0) return;

    const latestEvents = await this.prisma.gateEvent.findMany({
      where: { OR: filters },
      orderBy: { occurredAt: 'desc' },
      select: {
        driverId: true,
        truckId: true,
        rfidTagId: true,
        occurredAt: true,
        result: true,
      },
    });

    for (const event of latestEvents) {
      const entityId = event[field];
      if (!entityId || !summaries[entityId] || summaries[entityId].lastEventAt) continue;
      summaries[entityId].lastEventAt = event.occurredAt;
      summaries[entityId].lastResult = event.result;
    }
  }
}
