import { Truck, Driver, RFIDTag, GateEvent } from '@prisma/client';

export type TruckWithRelations = Truck & {
  assignedDriver?: Driver;
  rfidTag?: RFIDTag;
  gateEvents?: GateEvent[];
};