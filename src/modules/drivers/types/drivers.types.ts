import { Driver, Truck, GateEvent } from '@prisma/client';

export type DriverWithRelations = Driver & {
  assignedTrucks?: Truck[];
  gateEvents?: GateEvent[];
};