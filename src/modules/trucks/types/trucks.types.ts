import { Truck } from '@prisma/client';

export type TruckWithRelations = Truck & {
  assignedDriver?: unknown;
  rfidTag?: unknown;
  gateEvents?: unknown[];
};